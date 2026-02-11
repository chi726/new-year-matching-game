import React, { useState, useEffect } from 'react';
import { 
  Gift, ChevronRight, Trophy, AlertCircle, Settings, Users, Trash2, Lock, Eye, EyeOff, RotateCcw, CheckCircle, Database
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, 
  onSnapshot, updateDoc, deleteDoc, getDocs, addDoc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- Firebase 配置 ---
const firebaseConfig = {
  apiKey: "AIzaSyDxRqhqlq0N-ABlE8LxPoP7a5YdHvDEqXQ",
  authDomain: "newyearmatchgame.firebaseapp.com",
  projectId: "newyearmatchgame",
  storageBucket: "newyearmatchgame.firebasestorage.app",
  messagingSenderId: "492060979940",
  appId: "1:492060979940:web:5f43198bd8de721182f2f1",
  measurementId: "G-YV7SYMEHRX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'red-envelope-app'; 

const ADMIN_PASSWORD = "2026"; 

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); 
  const [participants, setParticipants] = useState([]);
  const [gameConfig, setGameConfig] = useState({ 
    targetSum: 6600, 
    status: 'collecting', 
    totalEnvelopes: 24,
    showAllResults: false,
    envelopePool: [] 
  });
  const [finalPairs, setFinalPairs] = useState([]);
  const [currentNickname, setCurrentNickname] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revealedIds, setRevealedIds] = useState(new Set());
  
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // 1. 初始化驗證
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        setError('身份驗證失敗，請重新整理');
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 監聽雲端資料
  useEffect(() => {
    if (!user) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameConfig(prev => ({ ...prev, ...docSnap.data() }));
      } else {
        setDoc(configRef, { 
          targetSum: 6600, 
          status: 'collecting', 
          totalEnvelopes: 24,
          showAllResults: false,
          envelopePool: []
        });
      }
    });

    const partsRef = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
    const unsubParts = onSnapshot(partsRef, (snapshot) => {
      setParticipants(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const pairsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
    const unsubPairs = onSnapshot(pairsRef, (snapshot) => {
      setFinalPairs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubConfig();
      unsubParts();
      unsubPairs();
    };
  }, [user]);

  // 3. 自動跳轉
  useEffect(() => {
    if (user && participants.length > 0 && view === 'landing') {
      const myEnrollment = participants.find(p => p.uid === user.uid);
      if (myEnrollment) {
        setCurrentNickname(myEnrollment.name);
        setView('results');
      }
    }
  }, [user, participants, view]);

  const getCashDetails = (value) => {
    if (typeof value !== 'number') return [];
    let remaining = value;
    const items = [];
    const denominations = [
      { val: 1000, type: 'bill', color: 'bg-blue-600 border-blue-400' },
      { val: 500, type: 'bill', color: 'bg-orange-800 border-orange-600' },
      { val: 100, type: 'bill', color: 'bg-red-500 border-red-400' },
      { val: 50, type: 'coin', color: 'bg-yellow-500 border-yellow-300' },
      { val: 10, type: 'coin', color: 'bg-slate-300 border-slate-100' },
      { val: 5, type: 'coin', color: 'bg-slate-400 border-slate-200' },
      { val: 1, type: 'coin', color: 'bg-orange-400 border-orange-200' }
    ];
    denominations.forEach(d => {
      const count = Math.floor(remaining / d.val);
      const displayCount = d.type === 'bill' ? Math.min(count, 3) : Math.min(count, 4);
      for (let i = 0; i < displayCount; i++) items.push(d);
      remaining %= d.val;
    });
    return items;
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!currentNickname.trim()) return;
    if (participants.some(p => p.name === currentNickname.trim() && p.uid !== user?.uid)) {
      setError('此暱稱已被使用');
      return;
    }
    setError('');
    setView('picking');
  };

  const generateEnvelopePool = async () => {
    try {
      const target = Number(gameConfig.targetSum) || 6600;
      const total = Number(gameConfig.totalEnvelopes) || 24;
      const pool = [];
      const numPairs = Math.floor(total / 2);

      for (let i = 0; i < numPairs; i++) {
        const maxUnits = target / 100;
        const kUnits = Math.floor(Math.random() * (maxUnits - 1)) + 1; 
        const val1 = kUnits * 100;
        const val2 = target - val1;
        pool.push(val1, val2);
      }
      if (total % 2 !== 0) pool.push('福');
      const shuffledPool = pool.sort(() => Math.random() - 0.5);
      const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
      await updateDoc(configRef, { envelopePool: shuffledPool });
      setSuccess('金額池生成成功！');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('生成失敗');
    }
  };

  const handlePick = async (index) => {
    if (!user || participants.some(p => p.envelopeIndex === index)) return;
    if (!gameConfig.envelopePool || !gameConfig.envelopePool.length) {
      setError('管理者尚未準備好金額池');
      return;
    }

    try {
      const assignedValue = gameConfig.envelopePool[index];
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'participants'), {
        name: currentNickname.trim(),
        envelopeIndex: index,
        uid: user.uid,
        value: assignedValue,
        timestamp: Date.now()
      });
      setView('results');
    } catch (err) {
      setError('領取失敗');
    }
  };

  const toggleEnvelope = (id) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteParticipant = async (pId) => {
    if (!window.confirm('確定要刪除這位參加者嗎？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'participants', pId));
    } catch (err) {
      setError('刪除失敗');
    }
  };

  const handleMatchAndShow = async () => {
    if (!user || participants.length < 2) return;
    try {
      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const oldPairs = await getDocs(pairsColl);
      await Promise.all(oldPairs.docs.map(d => deleteDoc(d.ref)));

      const target = Number(gameConfig.targetSum);
      let pool = [...participants];
      const pairs = [];

      while (pool.length > 1) {
        const current = pool.shift();
        if (current.value === '福') {
          pairs.push({ p1: current, isPair: false });
          continue;
        }
        const matchIdx = pool.findIndex(p => p.value === (target - current.value));
        if (matchIdx !== -1) {
          const match = pool.splice(matchIdx, 1)[0];
          pairs.push({ p1: current, p2: match, isPair: true });
        } else {
          pairs.push({ p1: current, isPair: false });
        }
      }
      if (pool.length > 0) pairs.push({ p1: pool[0], isPair: false });

      await Promise.all(pairs.map(p => addDoc(pairsColl, p)));
      const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
      await updateDoc(configRef, { status: 'finished', showAllResults: true });
      setSuccess('揭曉成功！已完成同步。');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('配對執行失敗');
    }
  };

  const resetGame = async () => {
    if (!user || !window.confirm('確定要重置遊戲嗎？')) return;
    try {
      const partsColl = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
      const parts = await getDocs(partsColl);
      await Promise.all(parts.docs.map(d => deleteDoc(d.ref)));
      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const pairs = await getDocs(pairsColl);
      await Promise.all(pairs.docs.map(d => deleteDoc(d.ref)));
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
        status: 'collecting', 
        showAllResults: false,
        envelopePool: []
      });
      setRevealedIds(new Set());
      setSuccess('系統已重置。');
    } catch (err) {
      setError('重置失敗');
    }
  };

  const ResultEnvelope = ({ pData, showName = true }) => {
    const displayId = pData.id || pData.uid;
    const isRevealed = revealedIds.has(displayId);
    const cashItems = getCashDetails(pData.value);

    return (
      <div className="flex flex-col items-center w-full">
        <div 
          onClick={() => toggleEnvelope(displayId)}
          className="relative h-40 w-full max-w-[140px] md:max-w-[160px] cursor-pointer"
          style={{ perspective: '1000px' }}
        >
          <div className={`absolute inset-x-0 transition-all duration-700 flex flex-col items-center z-10 ${isRevealed ? '-translate-y-24 md:-translate-y-28 opacity-100 scale-105 md:scale-110' : 'translate-y-0 opacity-0'}`}>
            {pData.value && pData.value !== '福' ? (
              <>
                <div className="flex flex-wrap justify-center gap-1 mb-2 max-w-[140px]">
                  {cashItems.map((item, i) => (
                    <div key={i} className={`${item.color} ${item.type === 'bill' ? 'w-10 h-6 md:w-12 md:h-7 rounded-sm' : 'w-6 h-6 md:w-7 md:h-7 rounded-full'} border flex items-center justify-center text-[8px] md:text-[9px] text-white font-black shadow-md animate-bounce`}>
                      ${item.val}
                    </div>
                  ))}
                </div>
                <div className="bg-white px-3 py-0.5 md:px-5 md:py-1 rounded-full shadow-2xl border-2 border-red-500 font-black text-red-600 whitespace-nowrap text-base">
                  ${pData.value}
                </div>
              </>
            ) : pData.value === '福' ? (
              <div className="text-center">
                <div className="text-5xl md:text-6xl animate-bounce mb-2">🧧</div>
                <div className="bg-white px-4 py-1 rounded-full shadow-lg border-2 border-yellow-500 font-black text-yellow-600 text-sm">大吉大利</div>
              </div>
            ) : (
              <div className="bg-white/90 px-4 py-2 rounded-2xl shadow-lg border border-red-200 text-red-400 font-bold text-xs animate-pulse">準備中...</div>
            )}
          </div>

          <div className={`absolute inset-0 bg-red-600 rounded-xl border-2 border-yellow-500 shadow-xl z-20 flex flex-col items-center justify-center transition-transform duration-500 ${isRevealed ? 'translate-y-6 md:translate-y-8 opacity-90 scale-95' : ''}`}>
            <div className="absolute top-0 w-full h-1/4 bg-red-700 rounded-b-3xl border-b border-yellow-600/30"></div>
            <div className="text-yellow-400 font-bold text-2xl md:text-3xl mb-1">{(Number(pData.envelopeIndex) || 0) + 1}</div>
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-yellow-500 flex items-center justify-center text-red-700 font-serif text-base md:text-lg border-2 border-yellow-200 shadow-inner font-bold">福</div>
            <div className="mt-2 text-[10px] text-red-200 font-medium px-2 truncate w-full text-center">
              {showName ? String(pData.name) : '點擊查看'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-orange-50 text-slate-800 pb-32 overflow-x-hidden">
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-red-100 flex justify-around p-4 md:p-5 z-50 shadow-[0_-4px_25px_rgba(0,0,0,0.1)]">
        <button onClick={() => setView('landing')} className={`flex flex-col items-center gap-1 transition-all ${view === 'landing' || view === 'picking' ? 'text-red-600 scale-110 font-black' : 'text-slate-400 hover:text-red-300'}`}>
          <Gift size={24} /><span className="text-[10px]">抽取紅包</span>
        </button>
        <button onClick={() => setView('results')} className={`flex flex-col items-center gap-1 transition-all ${view === 'results' ? 'text-red-600 scale-110 font-black' : 'text-slate-400 hover:text-red-300'}`}>
          <Trophy size={24} /><span className="text-[10px]">配對結果</span>
        </button>
        <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 transition-all ${view === 'admin' ? 'text-red-600 scale-110 font-black' : 'text-slate-400 hover:text-red-300'}`}>
          <Settings size={24} /><span className="text-[10px]">管理者</span>
        </button>
      </nav>

      <header className="bg-gradient-to-b from-red-700 to-red-800 text-yellow-400 p-8 md:p-10 text-center shadow-2xl border-b-4 border-yellow-500 relative">
        <h1 className="text-3xl md:text-4xl font-black tracking-widest drop-shadow-lg">新春紅包大配對</h1>
      </header>

      <main className="max-w-4xl mx-auto mt-6 md:mt-8 px-4 md:px-6">
        {error && <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-md"><AlertCircle size={18} />{String(error)}</div>}
        {success && <div className="mb-6 p-4 bg-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-md animate-pulse"><CheckCircle size={18} />{String(success)}</div>}

        {view === 'landing' && (
          <div className="max-w-md mx-auto bg-white p-8 md:p-10 rounded-[2rem] shadow-2xl text-center border-t-8 border-red-600 mt-4 animate-in fade-in zoom-in duration-500">
            <div className="text-7xl md:text-8xl mb-8">🧧</div>
            <h2 className="text-2xl font-black text-red-900 mb-2 tracking-widest uppercase">新年大吉！緣分紅包</h2>
            <form onSubmit={handleJoin} className="space-y-6">
              <input type="text" value={currentNickname} onChange={(e) => setCurrentNickname(e.target.value)} placeholder="輸入您的暱稱" className="w-full p-4 md:p-5 bg-orange-50 border-2 border-red-50 rounded-[1.5rem] text-center text-xl font-black outline-none shadow-inner" />
              <button className="w-full bg-red-600 text-white font-black py-4 md:p-5 rounded-[1.5rem] shadow-xl hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-3 text-lg">開始挑選 <ChevronRight size={24}/></button>
            </form>
          </div>
        )}

        {view === 'picking' && (
          <div className="max-w-2xl mx-auto mt-4 animate-in slide-in-from-bottom-8 duration-500">
            <h3 className="text-center font-black text-red-800 text-xl mb-8 tracking-wider">嗨 {currentNickname}，請挑一個位置</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 md:gap-4">
              {Array.from({ length: gameConfig.totalEnvelopes || 24 }).map((_, i) => {
                const p = participants.find(p => p.envelopeIndex === i);
                return (
                  <button key={i} disabled={!!p} onClick={() => handlePick(i)} className={`relative h-24 md:h-28 rounded-xl border-2 transition-all flex flex-col items-center justify-center shadow-md active:scale-95 ${p?.uid === user?.uid ? 'bg-yellow-400 border-yellow-600 scale-105 z-10 shadow-lg' : p ? 'bg-gray-200 border-gray-300 opacity-40 grayscale' : 'bg-red-600 border-yellow-500 hover:scale-105'}`}>
                    {!p && <div className="absolute top-0 inset-x-0 h-4 md:h-6 bg-red-700 rounded-b-2xl border-b border-yellow-600/30"></div>}
                    <span className={`text-[9px] md:text-[10px] ${p?.uid === user?.uid ? 'text-yellow-800' : 'text-yellow-200/50'}`}>No.</span>
                    <span className={`text-xl md:text-2xl font-black ${p?.uid === user?.uid ? 'text-red-700' : 'text-yellow-400'}`}>{i + 1}</span>
                    {!p && <div className="mt-0.5 md:mt-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-yellow-500 flex items-center justify-center text-[7px] md:text-[8px] text-red-800 border border-yellow-200 shadow-inner font-bold font-serif">福</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="max-w-md mx-auto bg-white p-8 rounded-[2rem] shadow-2xl border-t-8 border-red-600 space-y-8 mt-4">
            {!isAdminAuthenticated ? (
              <div className="text-center py-8">
                <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-red-600 shadow-inner"><Lock size={48} /></div>
                <h2 className="text-2xl font-black text-red-900 mb-6 uppercase">管理者驗證</h2>
                <form onSubmit={(e) => { e.preventDefault(); if (adminPasswordInput === ADMIN_PASSWORD) setIsAdminAuthenticated(true); else { setError('密碼不正確'); setAdminPasswordInput(''); } }} className="space-y-6">
                  <input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="管理密碼" className="w-full p-5 border-2 border-red-100 rounded-[1.2rem] text-center outline-none text-xl font-bold shadow-inner" />
                  <button className="w-full bg-red-600 text-white font-black py-4 rounded-[1.2rem] shadow-lg text-lg active:scale-95 transition-all">驗證解鎖</button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-6 pb-2 border-b-2 border-red-50">
                  <h2 className="text-xl font-black text-red-900 flex items-center gap-2"><Settings size={20} className="text-red-600" /> 管理中心</h2>
                  <button onClick={() => setIsAdminAuthenticated(false)} className="text-xs font-bold text-red-400 bg-red-50 px-3 py-1 rounded-full uppercase">Logout</button>
                </div>
                
                <div className="bg-orange-50/50 p-6 rounded-2xl border border-orange-100 shadow-inner">
                  <h3 className="text-xs font-black text-orange-800 mb-4 flex items-center gap-2 uppercase tracking-widest">1. 系統設定</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-[10px] font-black text-orange-700 block mb-1 uppercase tracking-tighter">配對總額 (R)</label>
                      <input type="number" step="100" value={gameConfig.targetSum} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { targetSum: parseInt(e.target.value) || 0 })} className="w-full p-2.5 rounded-xl border-2 border-orange-200 text-center font-black text-red-800 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-orange-700 block mb-1 uppercase tracking-tighter">紅包總格數</label>
                      <input type="number" value={gameConfig.totalEnvelopes} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { totalEnvelopes: parseInt(e.target.value) || 24 })} className="w-full p-2.5 rounded-xl border-2 border-orange-200 text-center font-black text-red-800 outline-none" />
                    </div>
                  </div>
                  <button onClick={generateEnvelopePool} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl shadow-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-2">
                    <Database size={16}/> 重新生成紅包金額池
                  </button>
                </div>

                <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100 shadow-inner">
                  <h3 className="text-xs font-black text-red-800 mb-4 flex items-center gap-2 uppercase tracking-widest">2. 揭曉操作</h3>
                  <div className="space-y-3">
                    <button onClick={handleMatchAndShow} disabled={participants.length < 2} className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-all text-base flex items-center justify-center gap-2 border-b-2 border-red-900"><Trophy size={20} /> 正式配對並公佈結果</button>
                    <div className="flex gap-2">
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { showAllResults: !gameConfig.showAllResults })} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black border-2 transition-all shadow-md ${gameConfig.showAllResults ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{gameConfig.showAllResults ? <><EyeOff size={18}/> 隱藏全體</> : <><Eye size={18}/> 顯示全體</>}</button>
                      <button onClick={resetGame} className="px-4 bg-white text-red-400 border-2 border-red-100 rounded-xl flex items-center justify-center shadow-md active:bg-red-50 transition-colors"><RotateCcw size={18}/></button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400 font-black mb-3 px-2">參加名單 ({participants.length})</p>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {participants.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">
                        <span className="font-black text-slate-700">#{p.envelopeIndex+1} {p.name} (${p.value})</span>
                        <button onClick={() => deleteParticipant(p.id)} className="text-red-300 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'results' && (
          <div className="mt-6 pb-20 animate-in fade-in duration-700">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-red-800 tracking-widest">緣分揭曉</h2>
              <p className="text-sm text-slate-400 mt-2 font-bold tracking-widest">✨ 點擊紅包查看金額，再次點擊收起</p>
            </div>

            <div className="space-y-12 md:space-y-20">
              {/* 【個人專屬紅包區】 */}
              {(() => {
                const myEnrollment = participants.find(p => p.uid === user?.uid);
                const myResult = finalPairs.find(p => p.p1.uid === user?.uid || (p.isPair && p.p2.uid === user?.uid));
                
                if (!myEnrollment) return (
                  <div className="max-w-md mx-auto bg-white p-12 rounded-[3rem] shadow-xl text-center border-t-8 border-red-600">
                    <p className="font-black text-red-800 text-xl tracking-widest">您尚未挑選紅包</p>
                  </div>
                );

                const pData = myResult 
                  ? (myResult.p1.uid === user?.uid ? myResult.p1 : myResult.p2)
                  : myEnrollment;

                return (
                  <div className="max-w-md mx-auto flex flex-col items-center bg-white pt-32 pb-10 px-8 rounded-[2.5rem] shadow-2xl border-4 border-yellow-500/40 relative animate-in zoom-in duration-700">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-red-900 px-8 py-2.5 rounded-full text-sm font-black shadow-xl tracking-widest z-[100] border-4 border-yellow-200">您的專屬紅包</div>
                    <ResultEnvelope pData={pData} />
                    <div className="mt-10 text-center bg-red-50 px-6 py-5 rounded-2xl border-2 border-red-100 w-full shadow-inner relative z-10">
                      <p className="text-red-400 text-[10px] font-black mb-1 tracking-widest uppercase opacity-80 uppercase">命中組合</p>
                      <p className="font-black text-red-800 text-xl md:text-2xl tracking-widest">
                        {myResult ? (myResult.isPair ? `${myResult.p1.name} ❤️ ${myResult.p2.name}` : `${myResult.p1.name} (大吉獨贏)`) : "等待揭曉中..."}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* 【全體揭曉區】：響應式網格排版 */}
              {gameConfig.showAllResults ? (
                <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
                  <div className="flex items-center gap-6 mb-16">
                    <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                    <span className="text-red-500 text-sm font-black tracking-[0.5em] uppercase px-2 md:px-4">揭曉名單</span>
                    <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-24 md:gap-y-32">
                    {finalPairs.map((pair, idx) => (
                      <div key={idx} className="bg-white/80 backdrop-blur-sm rounded-[3rem] pt-32 pb-10 px-6 md:px-8 border-2 border-red-100 shadow-xl transition-all relative">
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-1.5 rounded-full text-[10px] md:text-xs font-black shadow-xl z-[100] border-2 border-red-400 tracking-widest">緣分組合 #{idx+1}</div>
                        {pair.isPair ? (
                          <div className="flex flex-col gap-16 relative z-10">
                            <div className="grid grid-cols-2 gap-4 md:gap-8 relative">
                              <ResultEnvelope pData={pair.p1} />
                              <ResultEnvelope pData={pair.p2} />
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl md:text-5xl animate-pulse filter drop-shadow-2xl">❤️</div>
                            </div>
                            <div className="text-center font-black text-red-900 text-xl md:text-2xl bg-gradient-to-r from-red-50 to-red-100 py-6 rounded-2xl border-2 border-red-200 shadow-inner">
                              {pair.p1.name} & {pair.p2.name}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-10 relative z-10">
                            <ResultEnvelope pData={pair.p1} />
                            <div className="text-center font-black text-amber-800 bg-amber-50 px-10 py-3 rounded-full border-2 border-amber-200 shadow-md text-lg tracking-widest">
                              🌟 {pair.p1.name} 大吉大利
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-md mx-auto text-center p-16 md:p-20 bg-white/40 rounded-[3rem] border-4 border-dotted border-red-200 shadow-inner animate-in fade-in">
                  <Eye size={56} className="mx-auto text-red-200 mb-6 font-bold" />
                  <p className="text-red-300 font-black text-xl tracking-[0.4em] uppercase">全體名單封印中</p>
                  <p className="text-[10px] text-red-200 mt-4 font-bold tracking-[0.2em] italic">請關注管理者大揭曉！</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #fff5f5; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #fecaca; border-radius: 10px; }
        .perspective-1000 { perspective: 1000px; }
      `}</style>
    </div>
  );
};

export default App;