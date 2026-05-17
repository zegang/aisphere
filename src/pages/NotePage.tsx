import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  MessageSquare, 
  Mic, 
  Send, 
  FileText, 
  BookOpen, 
  Edit3, 
  MoreVertical, 
  Sparkles,
  ChevronDown,
  Volume2
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Source {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'link';
}

export default function Workspace() {
  const [sources, setSources] = useState<Source[]>([
    { id: '1', name: 'AI Safety Guidelines.pdf', type: 'pdf' },
    { id: '2', name: 'Project Roadmap.doc', type: 'doc' },
    { id: '3', name: 'https://docs.aisphere.io', type: 'link' },
  ]);
  
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hello! I have analyzed your sources. How can I help you today?', timestamp: new Date() }
  ]);
  
  const [input, setInput] = useState('');
  const [selectedAI, setSelectedAI] = useState('DeepSeek-R1');
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    
    // Simulate AI Response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `As ${selectedAI}, I'm processing your request based on the uploaded sources...`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    }, 1000);
  };

  const toggleSpeech = () => {
    setIsSpeaking(!isSpeaking);
    // Implementation for STT would go here
  };

  return (
    <div className="flex h-full bg-light-bg dark:bg-dark-bg text-light-default dark:text-dark-default overflow-hidden">
      
      {/* Part 1: Sources (Left) */}
      <div className="w-64 border-r border-light-border dark:border-dark-border flex flex-col bg-light-surface dark:bg-dark-surface">
        <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-500" /> Sources
          </h2>
          <button className="p-1 hover:bg-light-muted dark:hover:bg-dark-muted rounded transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3">
          <div className="relative mb-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-light-subtle" />
            <input 
              type="text" 
              placeholder="Search sources..." 
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1 overflow-y-auto">
            {sources.map(source => (
              <div key={source.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-light-muted dark:hover:bg-dark-muted cursor-pointer group transition-colors">
                <FileText className="w-4 h-4 text-light-subtle" />
                <span className="text-sm truncate flex-1">{source.name}</span>
                <MoreVertical className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Part 2: Chat (Middle) */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-light-bg dark:bg-dark-bg">
        {/* Chat Header */}
        <div className="px-6 py-3 border-b border-light-border dark:border-dark-border flex items-center justify-between bg-light-surface dark:bg-dark-surface">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
            <div className="relative group">
              <button className="flex items-center gap-1.5 font-semibold text-sm hover:text-blue-600 transition-colors">
                {selectedAI} <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {/* Mock Dropdown */}
              <div className="absolute top-full left-0 mt-1 hidden group-hover:block w-48 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl z-50">
                {['DeepSeek-R1', 'Llama-3', 'Mistral-Large'].map(model => (
                  <div 
                    key={model} 
                    onClick={() => setSelectedAI(model)}
                    className="px-4 py-2 text-sm hover:bg-light-muted dark:hover:bg-dark-muted cursor-pointer"
                  >
                    {model}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors">
              <Volume2 className="w-4 h-4 text-light-subtle" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-tl-none'
              }`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
                <span className="text-[10px] opacity-50 mt-1 block">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-transparent">
          <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-2xl p-2 shadow-lg focus-within:border-blue-500/50 transition-all">
            <button 
              onClick={toggleSpeech}
              className={`p-2 rounded-xl transition-colors ${isSpeaking ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-light-muted dark:hover:bg-dark-muted'}`}
            >
              <Mic className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Ask anything about your sources..."
              className="flex-1 bg-transparent border-none outline-none text-sm py-2 resize-none max-h-32 min-h-[40px]"
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 text-white rounded-xl transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[10px] text-center text-light-subtle mt-2">
            AI can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>

      {/* Part 3: Studio (Right) */}
      <div className="w-80 border-l border-light-border dark:border-dark-border flex flex-col bg-light-surface dark:bg-dark-surface">
        <div className="p-4 border-b border-light-border dark:border-dark-border">
          <h2 className="font-bold flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-purple-500" /> Studio
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border shadow-sm group hover:border-purple-500/30 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tighter">New Note</span>
              <span className="text-[10px] text-light-subtle">Just now</span>
            </div>
            <h3 className="text-sm font-semibold mb-1">Executive Summary</h3>
            <p className="text-xs text-light-subtle line-clamp-3">
              Based on the safety guidelines, the key takeaway is that local execution minimizes data leak risks...
            </p>
          </div>

          <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border shadow-sm opacity-60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Draft</span>
              <span className="text-[10px] text-light-subtle">2 hours ago</span>
            </div>
            <h3 className="text-sm font-semibold mb-1">Architecture Overview</h3>
            <p className="text-xs text-light-subtle line-clamp-3">
              The roadmap suggests moving towards a decentralized container registry...
            </p>
          </div>

          <button className="w-full py-3 border-2 border-dashed border-light-border dark:border-dark-border rounded-xl text-xs text-light-subtle hover:text-blue-600 hover:border-blue-500/50 transition-all flex flex-col items-center gap-1">
            <Plus className="w-4 h-4" />
            Create new saved response or note
          </button>
        </div>
        
        {/* Studio Footer */}
        <div className="p-4 border-t border-light-border dark:border-dark-border">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Sparkles className="w-4 h-4" /> Generate Report
          </button>
        </div>
      </div>

    </div>
  );
}