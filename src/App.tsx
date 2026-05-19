import React, { useState, useEffect, useRef } from 'react';
import { translations, Language } from './translations';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { 
  Menu, X, Plus, MessageSquare, Search, Sun, Moon, 
  Languages, LogIn, LogOut, Send, Mic, Image as ImageIcon, 
  Paperclip, Copy, Download, User as UserIcon, Check, Settings
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';

// Types
interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  timestamp: number;
}
interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

export default function App() {
  // State
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<{name: string} | null>(null);
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [selectedModel, setSelectedModel] = useState<'gemini-3.1-pro-preview' | 'gemini-3-flash-preview' | 'gemini-3.1-flash-image-preview'>('gemini-3.1-pro-preview');
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = translations[lang];

  // Load from local storage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') document.documentElement.classList.add('dark');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }

    const savedLang = localStorage.getItem('lang') as Language | null;
    if (savedLang) setLang(savedLang);

    const savedSessions = localStorage.getItem('chatSessions');
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions);
      setSessions(parsed);
      if (parsed.length > 0) setActiveSessionId(parsed[0].id);
    } else {
      createNewChat();
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('chatSessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, activeSessionId]);

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  };

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'New Conversation',
      createdAt: Date.now(),
      messages: []
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newSession.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  const handleSend = async (text: string, files?: FileList | null) => {
    if (!text.trim() && (!files || files.length === 0)) return;
    if (!activeSessionId) return;

    const newMessage: Message = {
      id: uuidv4(),
      role: 'user',
      text: text,
      timestamp: Date.now()
    };

    let updatedSession = { ...activeSession };
    
    // Auto-generate title from first message
    if (updatedSession.messages.length === 0) {
      updatedSession.title = text.substring(0, 30) + (text.length > 30 ? '...' : '');
    }
    
    updatedSession.messages = [...updatedSession.messages, newMessage];
    
    setSessions(prev => prev.map(s => s.id === activeSessionId ? updatedSession : s));
    setInput('');
    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.append('prompt', text);
      formData.append('model', selectedModel);
      
      // Formatting history for context, excluding the very last message we just added
      const historyCtx = updatedSession.messages.slice(0, -1).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      formData.append('history', JSON.stringify(historyCtx));
      
      if (files) {
         Array.from(files).forEach(file => {
           formData.append('files', file);
         });
      }

      if (selectedModel === 'gemini-3.1-flash-image-preview') {
        // Image Gen request
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, aspectRatio: '1:1' })
        });
        if (!res.ok) throw new Error('Failed to generate image');
        const data = await res.json();
        
        const aiMsg: Message = {
          id: uuidv4(),
          role: 'model',
          text: 'Generated Image',
          imageUrl: data.imageUrl,
          timestamp: Date.now()
        };
        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionId) return { ...s, messages: [...s.messages, aiMsg] };
          return s;
        }));
      } else {
        // Text / File Chat (Streaming)
        const response = await fetch('/api/chat', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('API Error');

        const reader = response.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        
        const aiMsgId = uuidv4();
        let aiFullText = '';

        // Add empty AI message first
        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              messages: [...s.messages, { id: aiMsgId, role: 'model', text: '', timestamp: Date.now() }]
            };
          }
           return s;
        }));

        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            aiFullText += chunk;
            
            setSessions(prev => prev.map(s => {
              if (s.id === activeSessionId) {
                const msgIndex = s.messages.findIndex(m => m.id === aiMsgId);
                const newMsgs = [...s.messages];
                if (msgIndex !== -1) {
                  newMsgs[msgIndex] = { ...newMsgs[msgIndex], text: aiFullText };
                }
                return { ...s, messages: newMsgs };
              }
              return s;
            }));
          }
        }
      }
    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: uuidv4(),
        role: 'model',
        text: `**Error:** An unexpected error occurred. Please try again.`,
        timestamp: Date.now()
      };
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, errorMsg] } : s));
    } finally {
      setIsGenerating(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startVoiceInput = () => {
    // Basic Speech Recognition fallback
    const windowAny = window as any;
    const SpeechRecognition = windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'en' ? 'en-US' : 'bn-BD';
    recognition.interimResults = false;
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + ' ' + transcript);
    };
    recognition.start();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadChat = () => {
    if (!activeSession) return;
    const chatText = activeSession.messages.map(m => `${m.role.toUpperCase()}:\n${m.text}`).join('\n\n');
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${activeSession.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSessions = sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-screen w-full overflow-hidden text-gray-800 dark:text-gray-100 font-sans">
      
      {/* Sidebar background overlay for mobile */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-72 h-full glass transition-transform duration-300 ease-in-out flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700/50">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Nova Chat</h1>
          <button className="md:hidden p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="p-3">
          <button 
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors shadow-md"
          >
            <Plus size={18} /> {t.newChat}
          </button>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder={t.searchChat}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-blue-500 rounded-lg pl-9 pr-3 py-2 text-sm outline-none transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filteredSessions.map(session => (
            <button
              key={session.id}
              onClick={() => {
                 setActiveSessionId(session.id);
                 if(window.innerWidth < 768) setSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors whitespace-nowrap overflow-hidden text-ellipsis text-sm",
                activeSessionId === session.id 
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium" 
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300"
              )}
            >
              <MessageSquare size={16} className="shrink-0" />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700/50 flex flex-col gap-2">
          {user ? (
            <div className="flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/5">
               <div className="flex items-center gap-2 truncate">
                  <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                    {user.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium truncate">{user.name}</span>
               </div>
               <button onClick={() => setUser(null)} title={t.logout} className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-md">
                 <LogOut size={16} />
               </button>
            </div>
          ) : (
            <button onClick={() => setUser({name: "Demo User"})} className="flex items-center gap-2 px-3 py-2 w-full hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-sm font-medium">
              <LogIn size={18} /> {t.login}
            </button>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Topbar */}
        <header className="h-14 glass border-b-0 border-l-0 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-3">
             <button className="md:hidden p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10" onClick={() => setSidebarOpen(true)}>
               <Menu size={20} />
             </button>
             
             {/* Model Selector */}
             <div className="relative group">
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as any)}
                  className="appearance-none bg-black/5 dark:bg-white/10 border border-transparent rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium outline-none cursor-pointer focus:ring-2 focus:ring-blue-500"
                >
                  <option value="gemini-3.1-pro-preview">{t.proReply}</option>
                  <option value="gemini-3-flash-preview">{t.fastReply}</option>
                  <option value="gemini-3.1-flash-image-preview">{t.imageGen}</option>
                </select>
             </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={downloadChat} title={t.download} className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
              <Download size={18} />
            </button>
            <button onClick={() => setLang(l => l === 'en' ? 'bn' : 'en')} title={t.language} className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center gap-1 text-sm font-bold">
              <Languages size={18} /> <span className="hidden sm:inline">{lang.toUpperCase()}</span>
            </button>
            <button onClick={toggleTheme} title={t.theme} className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
          {activeSession?.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                <MessageSquare size={32} className="text-blue-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t.welcome}</h2>
                <p className="mt-2">{t.subtitle}</p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6 pb-20">
              <AnimatePresence>
                {activeSession?.messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-4",
                      message.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                      message.role === 'user' ? "bg-purple-500 text-white" : "bg-blue-600 text-white"
                    )}>
                      {message.role === 'user' ? <UserIcon size={18} /> : <span className="font-bold text-sm">AI</span>}
                    </div>
                    
                    <div className={cn(
                      "group relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3 shadow-md",
                      message.role === 'user' 
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "glass dark:bg-gray-800/80 rounded-tl-sm text-gray-800 dark:text-gray-100"
                    )}>
                      {message.imageUrl && (
                        <img 
                          src={message.imageUrl} 
                          alt="Generated AI" 
                          referrerPolicy="no-referrer"
                          className="w-full max-w-sm rounded-lg mb-3 shadow-sm border border-black/10 dark:border-white/10" 
                        />
                      )}
                      
                      {message.role === 'model' ? (
                        <div className="markdown-body text-sm sm:text-base leading-relaxed break-words">
                          <Markdown remarkPlugins={[remarkGfm]}>
                            {message.text}
                          </Markdown>
                        </div>
                      ) : (
                        <p className="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{message.text}</p>
                      )}

                      {/* Interactive Actions */}
                      {message.role === 'model' && message.text && (
                        <button 
                          onClick={() => copyToClipboard(message.text)}
                          className="absolute -right-10 top-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-black/10 dark:hover:bg-white/10"
                          title="Copy"
                        >
                          <Copy size={16} className="text-gray-500 dark:text-gray-400" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isGenerating && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <span className="font-bold text-sm">AI</span>
                  </div>
                  <div className="glass dark:bg-gray-800/80 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="w-full px-4 sm:px-6 pb-6 pt-2">
          <div className="max-w-4xl mx-auto">
            <div className="glass dark:bg-gray-900/60 rounded-2xl p-2 shadow-[0_4px_30px_rgba(0,0,0,0.1)] dark:shadow-none border border-black/5 dark:border-white/10 flex items-end gap-2 transition-all focus-within:ring-2 focus-within:ring-blue-500/50">
              
              <div className="flex gap-1 p-1 h-full items-end pb-1.5">
                <input 
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  id="file-upload"
                  multiple
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title={t.uploadFile}
                  className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-white/10 transition-colors"
                >
                  <Paperclip size={20} />
                </button>
                <button 
                  type="button"
                  onClick={startVoiceInput}
                  title={t.voiceInput}
                  className="p-2 rounded-xl text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-white/10 transition-colors"
                >
                  <Mic size={20} />
                </button>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(input, fileInputRef.current?.files);
                  }
                }}
                placeholder={t.typeMessage}
                className="w-full max-h-40 min-h-[44px] bg-transparent resize-none py-2.5 px-2 outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
                rows={1}
                disabled={isGenerating}
              />
              
              <button 
                onClick={() => handleSend(input, fileInputRef.current?.files)}
                disabled={(!input.trim() && !fileInputRef.current?.files?.length) || isGenerating}
                className="mb-1.5 mr-1.5 p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white transition-colors shadow-sm flex-shrink-0"
              >
                <Send size={18} />
              </button>

            </div>
            
            {/* Show attached files quick view */}
            {fileInputRef.current?.files && fileInputRef.current.files.length > 0 && (
              <div className="mt-2 flex gap-2">
                <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 px-2 py-1 rounded-md">
                  {fileInputRef.current.files.length} file(s) attached
                </span>
                <button onClick={() => { if(fileInputRef.current) fileInputRef.current.value=''; setInput(input); }} className="text-xs text-red-500 hover:underline">Clear</button>
              </div>
            )}
            
            <p className="text-center text-xs text-gray-400 mt-2">
              Nova Chat can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
