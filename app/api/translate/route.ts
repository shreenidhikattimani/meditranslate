import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';


const GROQ_API_KEY = process.env.GROQ_API_KEY;


const GROQ_TEXT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'; 
const GROQ_AUDIO_MODEL = 'distil-whisper-large-v3-en'; 

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral'; 
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'; 

const REQUEST_TIMEOUT_MS = 60000; 


const groq = new Groq({ apiKey: GROQ_API_KEY });

interface TranslationRequest {
  text: string;
  targetLanguage: string;
  inputLanguage?: string;
  useOffline?: boolean;
  medicalCorrection?: boolean;
  simplify?: boolean;
  tone?: string;
  dialect?: string;
}

export async function POST(req: NextRequest) {
  try {

    let text = '';
    let targetLanguage = 'es';
    let inputLanguage = 'auto';
    let useOffline = false;
    let medicalCorrection = true;
    let simplify = false;
    let dialect = 'standard';


    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      
      const formData = await req.formData();
      const file = formData.get('file') as File;
      
     
      targetLanguage = (formData.get('targetLanguage') as string) || 'es';
      inputLanguage = (formData.get('inputLanguage') as string) || 'auto';
      useOffline = formData.get('useOffline') === 'true';
      
      if (!file) {
        return NextResponse.json({ error: 'No audio file uploaded' }, { status: 400 });
      }

      console.log(`[API] 🎙️ Processing Audio File (${file.size} bytes)...`);

      
      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: GROQ_AUDIO_MODEL,
        response_format: 'json',
        temperature: 0.0,
      });

      text = transcription.text;
      console.log(`[API] 📝 Audio Transcribed: "${text.slice(0, 50)}..."`);

    } else {

      const body: TranslationRequest = await req.json();
      text = body.text;
      targetLanguage = body.targetLanguage;
      inputLanguage = body.inputLanguage || 'auto';
      useOffline = body.useOffline || false;
      medicalCorrection = body.medicalCorrection ?? true;
      simplify = body.simplify || false;
      dialect = body.dialect || 'standard';
    }


    if (!text?.trim()) {
      return NextResponse.json({ error: 'Input text is empty.' }, { status: 400 });
    }

    const cleanedInput = text.trim().slice(0, 5000);
    const targetLanguageName = getLanguageName(targetLanguage);
    const inputLanguageName = getLanguageName(inputLanguage);
    
    console.log(`[API] 🔄 Translating: "${cleanedInput.slice(0, 30)}..." (${inputLanguageName} -> ${targetLanguageName})`);


    let correctedSourceText = cleanedInput;

    if (medicalCorrection) {
      const cleanupSystemPrompt = `You are an expert Audio Transcriber. 
      Your task is to fix phonetic errors, typos, and grammar in the INPUT LANGUAGE (${inputLanguageName}).
      
      Rules:
      1. Do NOT translate. Keep the output in ${inputLanguageName}.
      2. Fix "homophones" (words that sound similar but are wrong).
      3. Output ONLY the fixed text. No intros.`;

      const cleanupUserPrompt = `Raw Input: "${cleanedInput}"`;

      const rawCorrection = await callLLMWithTimeout(
        cleanupSystemPrompt, 
        cleanupUserPrompt, 
        false, 
        useOffline
      );
      
      correctedSourceText = cleanLLMOutput(rawCorrection);

    }

  
    
    const styleInstruction = simplify
      ? `Style: Simple, everyday language for a layperson. Dialect: ${dialect}.`
      : `Style: Formal clinical terminology. Precise definitions.`;

    const translationSystemPrompt = `You are an expert Medical Interpreter fluent in ${inputLanguageName}, English, and ${targetLanguageName}.
    
    TASK:
    Translate the input text (${inputLanguageName}) into two formats.

    OUTPUT JSON FORMAT:
    {
      "original": "The input text",
      "corrected": "ENGLISH CLINICAL TRANSLATION",
      "translated": "TARGET LANGUAGE (${targetLanguageName}) TRANSLATION",
      "confidence": 0.95
    }

    CRITICAL RULES:
    1. "corrected": MUST ALWAYS BE ENGLISH. It is the medical summary for the doctor.
       - If Input is "머리가 아파요" (Korean) -> "corrected" must be "Patient reports headache" (English).
    
    2. "translated": MUST ALWAYS BE ${targetLanguageName}.
       - It must be a direct translation from ${inputLanguageName} to ${targetLanguageName}.
       - Preserve the nuance of the original input.

    ${styleInstruction}`;

    const translationUserPrompt = JSON.stringify({ 
      text: correctedSourceText,
      sourceLanguage: inputLanguageName,
      targetLanguage: targetLanguageName
    });

    const llmResponse = await callLLMWithTimeout(
      translationSystemPrompt, 
      translationUserPrompt, 
      true, 
      useOffline
    );

    const parsed = safeJSONParse(llmResponse);


    if (!parsed || !parsed.translated) {
      console.error("[API] JSON Parse Failed. Raw:", llmResponse);
      const cleanFallback = cleanLLMOutput(llmResponse.replace(/[{}]/g, ''));
      return NextResponse.json({
        original: cleanedInput,
        corrected: "Translation processing error (Raw Output)",
        translated: cleanFallback, 
        confidence: 0.50
      });
    }

    return NextResponse.json({
      original: cleanedInput,
      corrected: parsed.corrected || "Medical context unavailable",
      translated: cleanLLMOutput(parsed.translated), 
      confidence: parsed.confidence || 0.95
    });

  } catch (err: any) {
    console.error('[API] Critical Error:', err);
    
    const errorMessage = err.message.includes('fetch failed') 
      ? 'Could not connect to AI Service. Check your internet.' 
      : err.message || 'Translation processing failed';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}



function cleanLLMOutput(text: string): string {
  if (!text) return "";
  return text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .replace(/^\[.*?\]:?/g, '')
    .replace(/^(Here is|This is|Output|Correction|Translation|Answer):/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

async function callLLMWithTimeout(
  systemPrompt: string, 
  userPrompt: string, 
  isJSON: boolean, 
  useOffline: boolean
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let result = '';
    const canUseGroq = !useOffline && !!GROQ_API_KEY;

    if (canUseGroq) {
      result = await callGroq(systemPrompt, userPrompt, isJSON, controller.signal);
    } else {
      console.log('[LLM] Using Local Ollama...');
      result = await callOllama(systemPrompt, userPrompt, isJSON, controller.signal);
    }
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGroq(system: string, user: string, isJSON: boolean, signal: AbortSignal) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_TEXT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.1, 
      response_format: isJSON ? { type: "json_object" } : { type: "text" }
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API Error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOllama(system: string, user: string, isJSON: boolean, signal: AbortSignal) {
  const urlsToTry = [OLLAMA_BASE_URL, 'http://127.0.0.1:11434'];
  for (const baseUrl of urlsToTry) {
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          stream: false,
          format: isJSON ? "json" : undefined, 
          options: { temperature: 0.1, num_predict: 1024 }
        }),
        signal,
      });
      if (!res.ok) throw new Error(`Ollama status ${res.status}`);
      const data = await res.json();
      return data.message?.content?.trim() || '';
    } catch (e: any) {
      if (e.name === 'AbortError') throw e; 
    }
  }
  throw new Error("Local AI is offline.");
}

function safeJSONParse(text: string) {
  try {
    let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try { return JSON.parse(clean); } catch (e) {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
    return null;
  } catch (e) { return null; }
}

function getLanguageName(code: string) {
  const names: Record<string, string> = {
    'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'hi': 'Hindi', 'zh': 'Mandarin Chinese', 'ar': 'Arabic', 'ru': 'Russian',
    'pt': 'Portuguese', 'ja': 'Japanese', 'ko': 'Korean', 'it': 'Italian',
    'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian', 'nl': 'Dutch',
    'tr': 'Turkish', 'pl': 'Polish', 'sv': 'Swedish', 'fil': 'Filipino'
  };
  const shortCode = code.split('-')[0];
  return names[code] || names[shortCode] || code;
}
