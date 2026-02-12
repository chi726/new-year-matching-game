import React, { useState, useEffect } from 'react';
import { 
  Gift, ChevronRight, Trophy, AlertCircle, Settings, Trash2, Lock, Eye, EyeOff, RotateCcw, CheckCircle, Database
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

  // 3. 自動導航
  useEffect(() => {
    if (user && participants.length > 0 && view === 'landing') {
      const myEnrollment = participants.find(p => p.uid === user.uid);
      if (myEnrollment) {
        setCurrentNickname(myEnrollment.name);
        setView('results');
      }
    }
  }, [user, participants, view]);

  // --- 功能邏輯 ---

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
      const target = Number(gameConfig.targetSum);
      const total = Number(gameConfig.totalEnvelopes);
      const pool = [];
      const numPairs = Math.floor(total / 2);

      for (let i = 0; i < numPairs; i++) {
        const val1 = (Math.floor(Math.random() * (target / 100 - 1)) + 1) * 100;
        pool.push(val1, target - val1);
      }
      if (total % 2 !== 0) pool.push('福');
      const shuffledPool = pool.sort(() => Math.random() - 0.5);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
        envelopePool: shuffledPool,
        status: 'collecting' 
      });
      setSuccess('金額池重新生成成功！');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError('金額池生成失敗'); }
  };

  const handlePick = async (index) => {
    if (!user || participants.some(p => p.envelopeIndex === index)) return;
    if (!gameConfig.envelopePool?.length) {
      setError('請等待管理者生成金額池');
      return;
    }
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'participants'), {
        name: currentNickname.trim(),
        envelopeIndex: index,
        uid: user.uid,
        value: gameConfig.envelopePool[index],
        timestamp: Date.now()
      });
      setView('results');
    } catch (err) { setError('挑選失敗'); }
  };

  const handleMatchAndShow = async () => {
    if (participants.length < 2) return;
    try {
      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const oldPairs = await getDocs(pairsColl);
      await Promise.all(oldPairs.docs.map(d => deleteDoc(d.ref)));
      
      let pool = [...participants];
      const target = Number(gameConfig.targetSum);
      const pairs = [];
      while (pool.length > 1) {
        const p1 = pool.shift();
        if (p1.value === '福') { pairs.push({ p1, isPair: false }); continue; }
        const mIdx = pool.findIndex(p => p.value === (target - p1.value));
        if (mIdx !== -1) pairs.push({ p1, p2: pool.splice(mIdx, 1)[0], isPair: true });
        else pairs.push({ p1, isPair: false });
      }
      if (pool.length) pairs.push({ p1: pool[0], isPair: false });

      await Promise.all(pairs.map(p => addDoc(pairsColl, p)));
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
        status: 'finished', 
        showAllResults: true 
      });
      setSuccess('大功告成！全體結果已即時公佈。');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError('配對公佈失敗'); }
  };

  const deleteParticipant = async (pId) => {
    if (!window.confirm('確定要刪除這位參加者嗎？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'participants', pId));
    } catch (err) { setError('刪除失敗'); }
  };

  const resetGame = async () => {
    if (!window.confirm('確定要重置遊戲嗎？')) return;
    try {
      const parts = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'participants'));
      await Promise.all(parts.docs.map(d => deleteDoc(d.ref)));
      const pairs = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'pairs'));
      await Promise.all(pairs.docs.map(d => deleteDoc(d.ref)));
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
        status: 'collecting', 
        showAllResults: false, 
        envelopePool: [] 
      });
      setRevealedIds(new Set());
      setSuccess('遊戲已重置。');
    } catch (err) { setError('重置失敗'); }
  };

  const toggleEnvelope = (id) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ResultEnvelope = ({ pData, showName = true }) => {
    const displayId = pData.id || pData.uid;
    const isRevealed = revealedIds.has(displayId);
    const cashItems = getCashDetails(pData.value);
    
    // 動態計算偏移高度：基礎偏移 40px，每多一張紙鈔多 10px，最高 110px
    const dynamicOffset = isRevealed ? Math.min(40 + (cashItems.length * 10), 110) : 0;

    return (
      <div className="flex flex-col items-center w-full relative">
        <div onClick={() => toggleEnvelope(displayId)} className="relative h-44 w-full max-w-[150px] md:max-w-[170px] cursor-pointer" style={{ perspective: '1000px' }}>
          {/* 內容物 (鈔票與金額) - 使用 inline style 動態控制 transform */}
          <div 
            className={`absolute inset-x-0 transition-all duration-700 flex flex-col items-center z-10 ${isRevealed ? 'opacity-100 scale-110' : 'translate-y-0 opacity-0'}`}
            style={{ transform: isRevealed ? `translateY(-${dynamicOffset}px) scale(1.1)` : 'translateY(0)' }}
          >
            <div className="flex flex-wrap justify-center gap-1 mb-1.5 max-w-[140px]">
              {cashItems.map((item, i) => (
                <div key={i} className={`${item.color} ${item.type === 'bill' ? 'w-10 h-6' : 'w-6 h-6 rounded-full'} border flex items-center justify-center text-[8px] text-white font-black shadow-md animate-bounce`}>${item.val}</div>
              ))}
              {pData.value === '福' && <div className="text-5xl animate-bounce">🧧</div>}
            </div>
            <div className="bg-white px-4 py-1 rounded-full shadow-2xl border-2 border-red-50 font-black text-red-600 whitespace-nowrap text-lg">
              {pData.value === '福' ? '大吉大利' : `$${pData.value}`}
            </div>
          </div>
          {/* 紅包本體 */}
          <div className={`absolute inset-0 bg-red-600 rounded-xl border-2 border-yellow-500 shadow-xl z-20 flex flex-col items-center transition-transform duration-500 ${isRevealed ? 'translate-y-8 opacity-90 scale-95' : ''}`}>
            <div className="absolute top-0 w-full h-1/4 bg-red-700 rounded-b-3xl border-b border-yellow-600/30"></div>
            {/* 修正內容物排版，使其更加緊湊且置中 */}
            <div className="h-full w-full flex flex-col items-center justify-center pt-8 space-y-1.5 px-2">
              <span className="text-yellow-400 font-black text-4xl leading-none drop-shadow-md">{Number(pData.envelopeIndex) + 1}</span>
              <div className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-yellow-500 flex items-center justify-center text-red-700 font-serif text-xl border-2 border-yellow-200 shadow-inner font-bold">福</div>
              <div className="text-[10px] text-red-100 font-bold truncate w-full text-center leading-tight opacity-90">{showName ? pData.name : '點擊查看'}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-orange-50 text-slate-800 pb-32 overflow-x-hidden font-sans selection:bg-red-100">
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-red-100 flex justify-around p-4 z-50 shadow-2xl">
        <button onClick={() => setView('landing')} className={`flex flex-col items-center gap-1 transition-all ${view === 'landing' || view === 'picking' ? 'text-red-600 font-black scale-105' : 'text-slate-400'}`}><Gift size={24} /><span className="text-[10px]">抽取紅包</span></button>
        <button onClick={() => setView('results')} className={`flex flex-col items-center gap-1 transition-all ${view === 'results' ? 'text-red-600 font-black scale-105' : 'text-slate-400'}`}><Trophy size={24} /><span className="text-[10px]">配對結果</span></button>
        <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 transition-all ${view === 'admin' ? 'text-red-600 font-black scale-105' : 'text-slate-400'}`}><Settings size={24} /><span className="text-[10px]">系統管理</span></button>
      </nav>

      <header className="bg-gradient-to-b from-red-700 to-red-800 text-yellow-400 p-8 text-center shadow-2xl border-b-4 border-yellow-500 relative">
        <h1 className="text-3xl md:text-4xl font-black tracking-widest uppercase drop-shadow-md">新春紅包大配對</h1>
      </header>

      <main className="max-w-5xl mx-auto mt-6 px-4">
        {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-2xl flex items-center gap-2 font-bold shadow-sm animate-in fade-in"><AlertCircle size={18} />{error}</div>}
        {success && <div className="mb-4 p-4 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center gap-2 font-bold shadow-sm animate-pulse"><CheckCircle size={18} />{success}</div>}

        {view === 'landing' && (
          <div className="max-w-md mx-auto bg-white p-10 rounded-[2.5rem] shadow-2xl text-center border-t-8 border-red-600 mt-4 animate-in fade-in zoom-in">
            <div className="text-8xl mb-8">🧧</div>
            <h2 className="text-2xl font-black text-red-900 mb-6 uppercase tracking-wider">新年大吉！緣分之旅</h2>
            <form onSubmit={handleJoin} className="space-y-6">
              <input type="text" value={currentNickname} onChange={(e) => setCurrentNickname(e.target.value)} placeholder="輸入您的暱稱" className="w-full p-4 bg-orange-50 border-2 border-red-50 rounded-2xl text-center text-xl font-black outline-none focus:border-red-500 transition-all" />
              <button className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-red-700 active:scale-95 transition-all text-lg flex items-center justify-center gap-2">進入挑選 <ChevronRight size={20}/></button>
            </form>
          </div>
        )}

        {view === 'picking' && (
          <div className="max-w-4xl mx-auto mt-4 animate-in slide-in-from-bottom-8">
            <h3 className="text-center font-black text-red-800 text-xl mb-10 tracking-widest">嗨 {currentNickname}，請挑一個好運位置</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 md:gap-4">
              {Array.from({ length: gameConfig.totalEnvelopes || 24 }).map((_, i) => {
                const p = participants.find(p => p.envelopeIndex === i);
                return (
                  <button key={i} disabled={!!p} onClick={() => handlePick(i)} className={`relative h-24 md:h-28 rounded-xl border-2 transition-all flex flex-col items-center justify-center shadow-md active:scale-95 ${p?.uid === user?.uid ? 'bg-yellow-400 border-yellow-600 scale-105 z-10 shadow-lg' : p ? 'bg-gray-200 border-gray-300 opacity-40 grayscale' : 'bg-red-600 border-yellow-500 hover:scale-105'}`}>
                    {!p && <div className="absolute top-0 inset-x-0 h-4 bg-red-700 rounded-b-2xl border-b border-yellow-600/30"></div>}
                    <span className={`text-[9px] ${p?.uid === user?.uid ? 'text-yellow-800' : 'text-yellow-200/50'}`}>No.</span>
                    <span className={`text-xl md:text-2xl font-black ${p?.uid === user?.uid ? 'text-red-700' : 'text-yellow-400'}`}>{i + 1}</span>
                    {!p && <div className="mt-0.5 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-[7px] text-red-800 border border-yellow-200 font-serif font-bold">福</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="max-w-md mx-auto bg-white p-8 rounded-[2rem] shadow-2xl border-t-8 border-red-600 space-y-8 animate-in fade-in">
            {!isAdminAuthenticated ? (
              <div className="text-center py-8">
                <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-red-600 shadow-inner"><Lock size={48} /></div>
                <form onSubmit={(e) => { e.preventDefault(); if (adminPasswordInput === ADMIN_PASSWORD) setIsAdminAuthenticated(true); else setError('管理密碼錯誤'); }} className="space-y-6">
                  <input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="管理密碼" className="w-full p-4 border-2 border-red-100 rounded-xl text-center text-xl font-bold outline-none focus:border-red-500" />
                  <button className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-lg text-lg">驗證權限</button>
                </form>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex justify-between items-center border-b-2 border-red-50 pb-2">
                  <h2 className="font-black text-red-900 uppercase flex items-center gap-2"><Settings size={18}/> 管理控制中心</h2>
                  <button onClick={() => setIsAdminAuthenticated(false)} className="text-xs text-red-400 font-bold hover:underline">登出</button>
                </div>
                <div className="bg-orange-50/60 p-6 rounded-3xl border border-orange-100 space-y-5 shadow-inner">
                  <h3 className="text-xs font-black text-orange-800 uppercase tracking-widest flex items-center gap-2">1. 參數設定</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-black text-orange-700 uppercase">總額 (R)</label><input type="number" step="100" value={gameConfig.targetSum} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { targetSum: parseInt(e.target.value) || 0 })} className="w-full p-3 rounded-xl border-2 border-orange-200 text-center font-bold" /></div>
                    <div><label className="text-[10px] font-black text-orange-700 uppercase">數量</label><input type="number" value={gameConfig.totalEnvelopes} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { totalEnvelopes: parseInt(e.target.value) || 24 })} className="w-full p-3 rounded-xl border-2 border-orange-200 text-center font-bold" /></div>
                  </div>
                  <button onClick={generateEnvelopePool} className="w-full bg-orange-600 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition-all text-xs flex items-center justify-center gap-2 font-bold"><Database size={16}/> 重新生成紅包金額池</button>
                </div>
                <div className="bg-red-50/60 p-6 rounded-3xl border border-red-100 space-y-4 shadow-inner">
                  <h3 className="text-xs font-black text-red-800 uppercase tracking-widest flex items-center gap-2">2. 一鍵揭曉</h3>
                  <button onClick={handleMatchAndShow} className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white font-black py-5 rounded-2xl shadow-xl active:scale-95 transition-all text-lg flex items-center justify-center gap-3 border-b-4 border-red-900"><Trophy size={24}/> 正式配對並公佈結果</button>
                  <div className="flex gap-3">
                    <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { showAllResults: !gameConfig.showAllResults })} className={`flex-1 py-3 rounded-2xl font-black border-2 transition-all shadow-md ${gameConfig.showAllResults ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-slate-300 border-slate-100'}`}>{gameConfig.showAllResults ? <><EyeOff size={18} className="inline mr-1"/> 隱藏結果</> : <><Eye size={18} className="inline mr-1"/> 顯示結果</>}</button>
                    <button onClick={resetGame} className="px-5 bg-white text-red-300 border-2 border-red-50 rounded-2xl flex items-center justify-center hover:text-red-600 transition-colors shadow-sm"><RotateCcw size={20}/></button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  <p className="text-xs text-slate-400 font-bold mb-2 uppercase">參加名單 ({participants.length})</p>
                  {participants.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs shadow-sm">
                      <span className="font-bold text-slate-700">#{p.envelopeIndex+1} {p.name} (${p.value})</span>
                      <button onClick={() => deleteParticipant(p.id)} className="text-red-200 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'results' && (
          <div className="pb-24 animate-in fade-in">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-black text-red-800 tracking-widest uppercase">緣分揭曉</h2>
              <p className="text-sm text-slate-400 mt-2 font-bold tracking-widest">✨ 點擊紅包查看金額，再次點擊收起</p>
            </div>

            <div className="space-y-12">
              {/* 個人專屬紅包 - 調整內距使其飽滿且動畫不遮擋標籤 */}
              {(() => {
                const myEnrollment = participants.find(p => p.uid === user?.uid);
                const myResult = finalPairs.find(p => p.p1.uid === user?.uid || (p.isPair && p.p2.uid === user?.uid));
                if (!myEnrollment) return (
                  <div className="max-w-md mx-auto bg-white p-16 rounded-[4rem] shadow-xl text-center border-t-8 border-red-600 font-black text-red-800">
                    <div className="text-8xl mb-8">🧧</div> 您尚未參加紅包挑選
                  </div>
                );
                const pData = myResult ? (myResult.p1.uid === user?.uid ? myResult.p1 : myResult.p2) : myEnrollment;
                return (
                  <div className="max-w-md mx-auto flex flex-col items-center bg-white pt-28 pb-12 px-8 rounded-[3.5rem] shadow-2xl border-4 border-yellow-500/40 relative animate-in zoom-in">
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-yellow-500 text-red-900 px-10 py-3 rounded-full text-base font-black shadow-xl z-[100] border-4 border-yellow-200 ring-4 ring-yellow-600/10">您的專屬紅包</div>
                    <ResultEnvelope pData={pData} />
                    <div className="mt-14 text-center bg-red-50 px-8 py-8 rounded-[2.5rem] border-2 border-red-100 w-full shadow-inner relative z-10">
                      <p className="text-red-400 text-[10px] font-black tracking-widest uppercase opacity-70 mb-2">您的命中組合</p>
                      <p className="font-black text-red-800 text-3xl tracking-widest leading-relaxed">
                        {myResult ? (myResult.isPair ? `${myResult.p1.name} & ${myResult.p2.name}` : `${myResult.p1.name} (大吉獨贏)`) : "等待揭曉中..."}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* 全體名單 - 雙欄響應式佈局，間距適中 */}
              {gameConfig.showAllResults ? (
                <div className="animate-in fade-in slide-in-from-bottom-12 mt-12">
                  <div className="flex items-center gap-6 mb-20 px-4">
                    <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                    <span className="text-red-500 text-sm font-black tracking-[0.5em] uppercase px-4">揭曉名單</span>
                    <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-24">
                    {finalPairs.length > 0 ? finalPairs.map((pair, idx) => (
                      <div key={idx} className="bg-white/80 backdrop-blur-sm rounded-[4rem] pt-28 pb-14 px-8 border-2 border-red-100 shadow-2xl relative transition-all hover:scale-[1.02]">
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-8 py-2 rounded-full text-xs font-black shadow-xl z-[100] border-2 border-red-400 tracking-widest uppercase">組合 #{idx+1}</div>
                        {pair.isPair ? (
                          <div className="flex flex-col gap-20 relative z-10">
                            <div className="grid grid-cols-2 gap-6 relative">
                              <ResultEnvelope pData={pair.p1} />
                              <ResultEnvelope pData={pair.p2} />
                            </div>
                            <div className="text-center font-black text-red-900 text-2xl md:text-3xl bg-gradient-to-r from-red-50 to-red-100 py-8 rounded-[2.5rem] border-2 border-red-200 shadow-inner">
                              {pair.p1.name} & {pair.p2.name}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-16 relative z-10">
                            <ResultEnvelope pData={pair.p1} />
                            <div className="text-center font-black text-amber-800 bg-amber-50 px-16 py-6 rounded-full border-2 border-amber-200 shadow-md text-2xl tracking-widest uppercase">🌟 {pair.p1.name} 大吉大利</div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="col-span-full text-center py-20 bg-white/40 rounded-3xl border-2 border-dashed border-red-200 font-black text-red-400 tracking-widest uppercase animate-pulse">
                        正在生成全體結果中...
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="max-w-md mx-auto text-center p-24 bg-white/40 rounded-[4rem] border-4 border-dotted border-red-200 shadow-inner animate-in fade-in">
                  <EyeOff size={72} className="mx-auto text-red-200 mb-8 font-black" />
                  <p className="text-red-300 font-black text-2xl tracking-[0.4em] uppercase">全體名單封印中</p>
                  <p className="text-xs text-red-200 mt-5 font-bold tracking-[0.2em] italic">請關注管理者進行大揭曉！</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #fff5f5; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #fecaca; border-radius: 10px; }
        .perspective-1000 { perspective: 1000px; }
      `}</style>
    </div>
  );
};

export default App;