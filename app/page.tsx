'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Volume2,
  Copy,
  Loader2,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle2,
  X,
  Menu,
  ArrowRightLeft,
  StopCircle,
  Activity
} from 'lucide-react';



const INPUT_LANGUAGES = {
  en: { name: 'English', code: 'en-US', flag: '🇺🇸' },
  es: { name: 'Spanish', code: 'es-ES', flag: '🇪🇸' },
  fr: { name: 'French', code: 'fr-FR', flag: '🇫🇷' },
  de: { name: 'German', code: 'de-DE', flag: '🇩🇪' },
  pt: { name: 'Portuguese', code: 'pt-PT', flag: '🇵🇹' },
  it: { name: 'Italian', code: 'it-IT', flag: '🇮🇹' },
  ja: { name: 'Japanese', code: 'ja-JP', flag: '🇯🇵' },
  zh: { name: 'Mandarin', code: 'zh-CN', flag: '🇨🇳' },
  ko: { name: 'Korean', code: 'ko-KR', flag: '🇰🇷' },
  ru: { name: 'Russian', code: 'ru-RU', flag: '🇷🇺' },
  ar: { name: 'Arabic', code: 'ar-SA', flag: '🇸🇦' },
  hi: { name: 'Hindi', code: 'hi-IN', flag: '🇮🇳' },
  pl: { name: 'Polish', code: 'pl-PL', flag: '🇵🇱' },
  tr: { name: 'Turkish', code: 'tr-TR', flag: '🇹🇷' },
  nl: { name: 'Dutch', code: 'nl-NL', flag: '🇳🇱' },
  vi: { name: 'Vietnamese', code: 'vi-VN', flag: '🇻🇳' },
  th: { name: 'Thai', code: 'th-TH', flag: '🇹🇭' },
  id: { name: 'Indonesian', code: 'id-ID', flag: '🇮🇩' },
  fil: { name: 'Filipino', code: 'fil-PH', flag: '🇵🇭' },
  sv: { name: 'Swedish', code: 'sv-SE', flag: '🇸🇪' },
};

const TARGET_LANGUAGES = { ...INPUT_LANGUAGES }; 

interface TranslationResult {
  original: string;
  corrected: string;
  translated: string;
  confidence: number;
}

export default function HealthcareTranslator() {

  
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);

  
  const [inputLanguage, setInputLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es'); 
  const [useOfflineMode, setUseOfflineMode] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);


  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isFallbackMode, setIsFallbackMode] = useState(false); // Safari/Firefox detection


  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);


  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const autoPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);



  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const swapLanguages = () => {
    stopSpeaking();
    const prevInput = inputLanguage;
    setInputLanguage(targetLanguage);
    setTargetLanguage(prevInput);
    
    setTranslationResult(null);
    setTranscript('');
    showToast('Languages Swapped');
  };


  useEffect(() => {

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setAvailableVoices(voices);
    };
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }


    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.warn("Native Speech API missing. Switching to Fallback Audio Recorder.");
        setIsFallbackMode(true); 
      }
    }
  }, []);


  const startFallbackRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob); 
        

        stream.getTracks().forEach(track => track.stop()); 
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError('');
    } catch (err) {
      console.error("Fallback Mic Error:", err);
      setError("Microphone access denied. Check settings.");
    }
  };

  const stopFallbackRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };


  useEffect(() => {

    if (isFallbackMode || typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    const languageCode = INPUT_LANGUAGES[inputLanguage as keyof typeof INPUT_LANGUAGES]?.code || 'en-US';
    
    recognition.lang = languageCode;
    console.log(`🎤 Init Native Mic: ${languageCode}`);

    recognition.continuous = true; 
    recognition.interimResults = true; 
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      setError('');
      stopSpeaking();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const currentText = finalTranscript || interimTranscript;
      setTranscript(currentText);


      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (currentText.trim().length > 0) {
           console.log("Silence detected (4s). Auto-submitting...");
           recognition.stop(); 
        }
      }, 4000); 
    };

    recognition.onerror = (e: any) => {
       console.error('Speech Recognition Error:', e.error);
       if (e.error === 'no-speech') return;
       if (e.error === 'not-allowed') {
         setError('Microphone permission denied.');
         setIsRecording(false);
       } else if (e.error === 'language-not-supported') {

         console.warn(`Language ${languageCode} not fully supported in this browser.`);
       }
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

  }, [inputLanguage, isFallbackMode]);

 
  const toggleRecording = () => {
    if (isRecording) {
   
      if (isFallbackMode) {
        stopFallbackRecording();
      } else {
        recognitionRef.current?.stop();
        setIsRecording(false);
      }
    } else {
    
      setTranslationResult(null);
      setTranscript('');
      setError('');
      stopSpeaking();

      if (isFallbackMode) {
        startFallbackRecording();
      } else {
 
        const currentCode = INPUT_LANGUAGES[inputLanguage as keyof typeof INPUT_LANGUAGES]?.code || 'en-US';
        
        if (recognitionRef.current) {
           recognitionRef.current.abort();
           recognitionRef.current.lang = currentCode;
           console.log(`🚀 Starting Mic with strict language: ${currentCode}`);
           try {
              recognitionRef.current.start();
           } catch(e) {
              console.error("Mic start error:", e);
           }
        }
      }
    }
  };

  
  const handleTextTranslation = async () => {
    if (!transcript?.trim()) return;

    stopSpeaking();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcript,
          targetLanguage,
          inputLanguage,
          useOffline: useOfflineMode,
          medicalCorrection: true,
        }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      
      processTranslationResult(data);

    } catch (err: any) {
       handleApiError(err, transcript);
    } finally {
      setIsLoading(false);
    }
  };

 
  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('targetLanguage', targetLanguage);
    formData.append('inputLanguage', inputLanguage);
    formData.append('useOffline', String(useOfflineMode));

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Audio translation failed');
      const data = await response.json();
      
      setTranscript(data.original); 
      processTranslationResult(data);

    } catch (err: any) {
      handleApiError(err, "Audio Processing...");
    } finally {
      setIsLoading(false);
    }
  };


  const processTranslationResult = (data: TranslationResult) => {
    setTranslationResult(data);
    if (autoPlayEnabled) {
      if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
      autoPlayTimeoutRef.current = setTimeout(() => {
        speakTranslation(data.translated);
      }, 500);
    }
  };


  const handleApiError = (err: any, originalText: string) => {
    if (err.name === 'AbortError') return;
    
    console.warn("API Error, using fallback display.");
    setTranslationResult({
        original: originalText,
        corrected: `[Error/Offline] ${originalText}`,
        translated: "Translation Service Unavailable",
        confidence: 0
    });
    setError('Service unavailable. Check API Key or Connection.');
  };


  useEffect(() => {
    
    if (!isRecording && transcript.trim().length > 0 && !isFallbackMode) {
       handleTextTranslation();
    }
 
  }, [isRecording]); 


  const speakTranslation = (textToSpeak?: string) => {
    const text = textToSpeak || translationResult?.translated;
    if (!text) return;

    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    const utterance = new SpeechSynthesisUtterance(text);
    const targetCode = TARGET_LANGUAGES[targetLanguage as keyof typeof TARGET_LANGUAGES]?.code || 'en-US';
    
    utterance.lang = targetCode;
    
    if (availableVoices.length > 0) {
       let voice = availableVoices.find(v => v.lang === targetCode);
       if (!voice) {
         const langBase = targetCode.split('-')[0];
         voice = availableVoices.find(v => v.lang.startsWith(langBase));
       }
       if (voice) utterance.voice = voice;
    }

    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
        console.error("TTS Error", e);
        setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  };


  return (
    <div className="min-h-screen bg-[var(--bg-body)] text-[var(--text-primary)] font-sans">
      
      {toastMessage && (
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-soft flex items-center gap-3 animate-in fade-in slide-in-from-top-2 border-2 ${
          toastMessage.type === 'error' 
            ? 'bg-white border-red-100 text-red-600' 
            : 'bg-white border-emerald-100 text-emerald-600'
        }`}>
          {toastMessage.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="font-bold">{toastMessage.text}</span>
        </div>
      )}


      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 rotate-3">
              <Activity size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">MediTranslate</h1>
              <p className="text-[10px] font-bold tracking-wider text-blue-600 uppercase">Pro Medical AI</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 shadow-sm">
              {useOfflineMode ? (
                <>
                  <WifiOff size={14} className="text-emerald-500" />
                  <span className="text-xs font-bold text-gray-600">OFFLINE</span>
                </>
              ) : (
                <>
                  <Wifi size={14} className="text-blue-500" />
                  <span className="text-xs font-bold text-gray-600">ONLINE</span>
                </>
              )}
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:bg-[rgba(0,0,0,0.05)] rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          
          <div className={`lg:col-span-4 space-y-6 ${mobileMenuOpen ? 'block fixed inset-0 z-[60] bg-white p-6 overflow-y-auto' : 'hidden lg:block'}`}>
            
            {mobileMenuOpen && (
              <div className="flex justify-between items-center mb-6 lg:hidden">
                <h2 className="text-xl font-bold">Settings</h2>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-white rounded-full shadow-sm"><X size={24} /></button>
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-lg border border-gray-100 p-6 space-y-6 sticky top-28">
              
              <div className="space-y-4">
                <div 
                  onClick={() => setUseOfflineMode(!useOfflineMode)}
                  className={`flex items-center justify-between p-4 rounded-[1.5rem] border-2 cursor-pointer transition-all ${
                    useOfflineMode 
                      ? 'bg-emerald-50/50 border-emerald-200' 
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${useOfflineMode ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                       {useOfflineMode ? <WifiOff size={20}/> : <Wifi size={20}/>}
                    </div>
                    <div>
                       <h3 className="text-sm font-bold text-gray-800">Connectivity</h3>
                       <span className={`text-sm ${useOfflineMode ? 'text-emerald-700' : 'text-gray-500'}`}>
                         {useOfflineMode ? 'Offline Mode Active' : 'Online Mode Active'}
                       </span>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-[3px] ${useOfflineMode ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}></div>
                </div>

                <div 
                  onClick={() => setAutoPlayEnabled(!autoPlayEnabled)}
                  className={`flex items-center justify-between p-4 rounded-[1.5rem] border-2 cursor-pointer transition-all ${
                    autoPlayEnabled 
                      ? 'bg-blue-50/50 border-blue-200' 
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${autoPlayEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      <Volume2 size={20}/>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-800">Auto-Play</h3>
                      <span className="text-sm text-gray-500">Hear results automatically</span>
                    </div>
                  </div>
                  <div className={`w-12 h-7 rounded-full relative transition-colors ${autoPlayEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${autoPlayEnabled ? 'left-6' : 'left-1'}`}></div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100 my-4"></div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">Patient Speaks</label>
                  <select
                    value={inputLanguage}
                    onChange={(e) => setInputLanguage(e.target.value)}
                    className="w-full p-3 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {Object.entries(INPUT_LANGUAGES).map(([code, lang]) => (
                      <option key={code} value={code} className="text-black">{lang.flag} {lang.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-center">
                  <button 
                    onClick={swapLanguages}
                    className="p-3 bg-white border border-gray-200 hover:border-blue-400 hover:text-blue-600 text-gray-500 rounded-full transition-all shadow-sm hover:shadow-md active:scale-95"
                    title="Swap Languages"
                  >
                    <ArrowRightLeft size={20} />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">Translate To</label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full p-3 rounded-xl border border-gray-200 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {Object.entries(TARGET_LANGUAGES).map(([code, lang]) => (
                      <option key={code} value={code} className="text-black">{lang.flag} {lang.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          
          <div className="lg:col-span-8 space-y-6 md:space-y-8">
            
            <div className="bg-white rounded-3xl md:rounded-[2.5rem] shadow-lg border border-gray-100 overflow-hidden relative transition-all">
               
               <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 opacity-50"></div>
              
              <div className="px-6 md:px-8 py-4 md:py-6 border-b border-gray-50 flex justify-between items-center mt-2">
                <h2 className="text-xs md:text-sm font-extrabold text-gray-500 uppercase tracking-widest">Patient Input</h2>
                {isRecording && <span className="flex items-center gap-2 text-red-500 text-[10px] md:text-xs font-bold animate-pulse bg-red-50 px-3 py-1 rounded-full">● LISTENING</span>}
              </div>
              
              <div className="p-6 md:p-10 flex flex-col items-center justify-center space-y-8 md:space-y-10">
                
                <div className="relative flex items-center justify-center py-4 md:py-8">
                  {isRecording && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="absolute w-24 h-24 md:w-28 md:h-28 rounded-full border border-blue-400 opacity-0 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                      <div className="absolute w-24 h-24 md:w-28 md:h-28 rounded-full border border-purple-400 opacity-0 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                      <div className="absolute w-28 h-28 md:w-32 md:h-32 bg-blue-500/20 blur-3xl rounded-full animate-pulse"></div>
                    </div>
                  )}

                  <button
                    onClick={toggleRecording}
                    disabled={isLoading}
                    className={`
                      relative z-10 w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all duration-500
                      ${isRecording 
                        ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)] scale-110' 
                        : 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:scale-105 hover:shadow-xl active:scale-95 shadow-lg shadow-blue-500/30'}
                      group
                    `}
                  >
                    <div className="absolute inset-2 rounded-full border border-white/30"></div>
                    <div className={`relative z-20 text-white transition-transform duration-300`}>
                      {isRecording ? (
                        <StopCircle size={40} className="md:w-[52px] md:h-[52px]" fill="white" />
                      ) : (
                        <Mic size={40} className="md:w-[52px] md:h-[52px]" />
                      )}
                    </div>
                  </button>
                </div>

                <div className="text-center space-y-2 md:space-y-3">
                   <p className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                     {isRecording ? 'Listening...' : (isFallbackMode ? 'Tap to Record' : 'Tap to Speak')}
                   </p>
                   <p className="text-sm md:text-base text-gray-500 font-medium px-4">
                     {isFallbackMode 
                        ? 'Using Audio Recorder (Safari/Firefox Mode)' 
                        : (isRecording ? 'Auto-sends after 4s of silence...' : 'Tap microphone to start translating.')}
                   </p>
                </div>

                {transcript && (
                  <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-4">
                    <div className="p-4 md:p-6 bg-gray-50 rounded-2xl md:rounded-[2rem] border border-gray-100 relative group">
                      <p className="text-lg md:text-xl text-center text-gray-800 leading-relaxed font-medium">“{transcript}”</p>
                        <button onClick={() => copyToClipboard(transcript)} className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110">
                          <Copy size={18} className="text-gray-500" />
                        </button>
                    </div>
                  </div>
                )}
              </div>
            </div>


            {error && (
              <div className="bg-red-50 border-2 border-red-100 rounded-full p-4 flex items-center justify-center gap-3 animate-in fade-in">
                <AlertCircle className="text-red-500" size={24} />
                <p className="text-red-700 font-bold text-sm md:text-base">{error}</p>
              </div>
            )}

            {isLoading && (
               <div className="flex flex-col items-center justify-center py-12 md:py-16 space-y-6 bg-white rounded-3xl md:rounded-[2.5rem] shadow-lg border border-gray-100">
                  <div className="relative">
                     <div className="w-16 h-16 border-4 border-blue-100 rounded-full align-middle"></div>
                     <Loader2 size={64} className="text-blue-500 animate-spin absolute top-0 left-0" />
                  </div>
                  <p className="text-gray-500 font-bold text-lg">Translating...</p>
               </div>
            )}

            {translationResult && !isLoading && (
              <div className="grid grid-cols-1 gap-6 md:gap-8 animate-in slide-in-from-bottom-12 duration-700">
                
                <div className="bg-white rounded-3xl md:rounded-[2.5rem] shadow-lg border border-emerald-100 overflow-hidden">
                   <div className="bg-emerald-50/80 px-6 md:px-8 py-5 border-b border-emerald-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-100 rounded-full"><CheckCircle2 size={18} className="text-emerald-600" /></div>
                          <h3 className="text-xs md:text-sm font-extrabold text-emerald-800 uppercase tracking-widest">Medical Context</h3>
                      </div>
                      <span className="text-[10px] md:text-xs font-bold text-emerald-700 bg-white border border-emerald-200 px-3 py-1 rounded-full shadow-sm">
                        {Math.round(translationResult.confidence * 100)}% Match
                      </span>
                   </div>
                   <div className="p-6 md:p-8">
                      <p className="text-lg md:text-xl text-gray-800 leading-relaxed">{translationResult.corrected}</p>
                   </div>
                   <div className="px-6 md:px-8 py-4 bg-gray-50 flex justify-end">
                      <button onClick={() => copyToClipboard(translationResult.corrected)} className="flex items-center gap-2 text-gray-600 font-bold text-xs md:text-sm py-2 px-4 hover:bg-gray-200 rounded-full transition-colors">
                        <Copy size={16} /> Copy Text
                      </button>
                   </div>
                </div>

                <div className="rounded-3xl md:rounded-[2.5rem] p-[3px] bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 shadow-xl shadow-blue-100">
                  <div className="bg-white rounded-[1.3rem] md:rounded-[2.3rem] overflow-hidden h-full relative">
                      
                      <div className="px-6 md:px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-purple-50">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center shadow-sm">
                              <Volume2 size={16} className="text-white"/>
                           </div>
                           <h3 className="text-sm md:text-base font-bold text-blue-900 truncate max-w-[150px] md:max-w-none">
                             To {TARGET_LANGUAGES[targetLanguage as keyof typeof TARGET_LANGUAGES].name}
                           </h3>
                        </div>
                        {isSpeaking && <div className="flex gap-1 h-4 items-end bg-white px-3 py-1 rounded-full shadow-sm">
                          <div className="w-1.5 bg-blue-500 animate-[bounce_1s_infinite] h-full rounded-full"></div>
                          <div className="w-1.5 bg-purple-500 animate-[bounce_1.2s_infinite] h-2/3 rounded-full"></div>
                          <div className="w-1.5 bg-pink-500 animate-[bounce_0.8s_infinite] h-full rounded-full"></div>
                        </div>}
                      </div>
                      
                      <div className="p-6 md:p-10 min-h-[160px] md:min-h-[180px] flex flex-col justify-center bg-gradient-to-b from-white to-blue-50/30">
                        <p className="text-2xl md:text-3xl font-bold text-blue-950 leading-tight text-center">
                          “{translationResult.translated}”
                        </p>
                      </div>

                      <div className="p-4 md:p-6 flex gap-3 md:gap-4 justify-center bg-white/50 backdrop-blur-md border-t border-gray-100">
                        <button 
                           onClick={() => isSpeaking ? stopSpeaking() : speakTranslation()}
                           className={`flex items-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-full font-bold transition-all shadow-lg ${
                             isSpeaking 
                               ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                               : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                           }`}
                        >
                           {isSpeaking ? <StopCircle size={20} /> : <Volume2 size={20} />}
                           {isSpeaking ? 'Stop Audio' : 'Play Audio'}
                        </button>
                        <button 
                           onClick={() => copyToClipboard(translationResult.translated)}
                           className="p-3 md:p-4 bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm"
                        >
                           <Copy size={20} />
                        </button>
                      </div>
                  </div>
                </div>

              </div>
            )}
            
          </div>
        </div>
      </main>
    </div>
  );
}
