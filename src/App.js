import React, { useState, useEffect } from 'react';
import { 
  Gift, ChevronRight, Trophy, AlertCircle, Settings, Trash2, Lock, Eye, EyeOff, RotateCcw, CheckCircle, Database
} from 'lucide-react'; // 修正：移除了未使用的 Users
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
      if (docSnap.exists()) setGameConfig(prev => ({ ...prev, ...docSnap.data() }));
      else setDoc(configRef, { targetSum: 6600, status: 'collecting', totalEnvelopes: 24, showAllResults: false, envelopePool: [] });
    });
    const partsRef = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
    const unsubParts = onSnapshot(partsRef, (snapshot) => setParticipants(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    const pairsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
    const unsubPairs = onSnapshot(pairsRef, (snapshot) => setFinalPairs(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsubConfig(); unsubParts(); unsubPairs(); };
  }, [user]);

  // 3. 自動辨識：已參加者直接跳轉
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

  // 管理者：生成金額池
  const generateEnvelopePool = async () => {
    try {
      const target = Number(gameConfig.targetSum);
      const total = Number(gameConfig.totalEnvelopes);
      const pool = [];
      for (let i = 0; i < Math.floor(total / 2); i++) {
        const val1 = (Math.floor(Math.random() * (target / 100 - 1)) + 1) * 100;
        pool.push(val1, target - val1);
      }
      if (total % 2 !== 0) pool.push('福');
      const shuffledPool = pool.sort(() => Math.random() - 0.5);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { envelopePool: shuffledPool });
      setSuccess('金額池已生成！');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError('生成失敗'); }
  };

  const handlePick = async (index) => {
    if (!user || participants.some(p => p.envelopeIndex === index)) return;
    if (!gameConfig.envelopePool?.length) { setError('請等待管理者準備金額'); return; }
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
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { status: 'finished', showAllResults: true });
      setSuccess('揭曉成功！已同步至所有端。');
    } catch (err) { setError('配對失敗'); }
  };

  const resetGame = async () => {
    if (!window.confirm('確定要清除所有資料嗎？')) return;
    const parts = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'participants'));
    await Promise.all(parts.docs.map(d => deleteDoc(d.ref)));
    const pairs = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'pairs'));
    await Promise.all(pairs.docs.map(d => deleteDoc(d.ref)));
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { status: 'collecting', showAllResults: false, envelopePool: [] });
    setRevealedIds(new Set());
  };

  const ResultEnvelope = ({ pData, showName = true }) => {
    const isRevealed = revealedIds.has(pData.id || pData.uid);
    const cashItems = getCashDetails(pData.value);
    return (
      <div className="flex flex-col items-center w-full">
        <div onClick={() => {
          setRevealedIds(prev => {
            const next = new Set(prev);
            if (next.has(pData.id || pData.uid)) next.delete(pData.id || pData.uid);
            else next.add(pData.id || pData.uid);
            return next;
          });
        }} className="relative h-40 w-full max-w-[140px] md:max-w-[160px] cursor-pointer" style={{ perspective: '1000px' }}>
          <div className={`absolute inset-x-0 transition-all duration-700 flex flex-col items-center z-10 ${isRevealed ? '-translate-y-28 opacity-100 scale-110' : 'translate-y-0 opacity-0'}`}>
            <div className="flex flex-wrap justify-center gap-1 mb-2 max-w-[140px]">
              {cashItems.map((item, i) => <div key={i} className={`${item.color} ${item.type === 'bill' ? 'w-10 h-6' : 'w-6 h-6 rounded-full'} border flex items-center justify-center text-[8px] text-white font-black shadow-md animate-bounce`}>${item.val}</div>)}
              {pData.value === '福' && <div className="text-5xl animate-bounce">🧧</div>}
            </div>
            <div className="bg-white px-4 py-1 rounded-full shadow-2xl border-2 border-red-500 font-black text-red-600 whitespace-nowrap text-lg">
              {pData.value === '福' ? '大吉大利' : `$${pData.value}`}
            </div>
          </div>
          <div className={`absolute inset-0 bg-red-600 rounded-xl border-2 border-yellow-500 shadow-xl z-20 flex flex-col items-center justify-center transition-transform duration-500 ${isRevealed ? 'translate-y-8 opacity-90 scale-95' : ''}`}>
            <div className="absolute top-0 w-full h-1/4 bg-red-700 rounded-b-3xl border-b border-yellow-600/30"></div>
            <div className="text-yellow-400 font-bold text-3xl mb-1">{Number(pData.envelopeIndex) + 1}</div>
            <div className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center text-red-700 font-serif text-lg border-2 border-yellow-200 shadow-inner font-bold">福</div>
            <div className="mt-2 text-[10px] text-red-200 font-medium px-2 truncate w-full text-center">{showName ? pData.name : '點擊查看'}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-orange-50 text-slate-800 pb-32 overflow-x-hidden font-sans">
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-red-100 flex justify-around p-4 z-50 shadow-xl">
        <button onClick={() => setView('landing')} className={`flex flex-col items-center gap-1 ${view === 'landing' || view === 'picking' ? 'text-red-600 font-bold' : 'text-slate-400'}`}><Gift size={24} /><span className="text-[10px]">抽取</span></button>
        <button onClick={() => setView('results')} className={`flex flex-col items-center gap-1 ${view === 'results' ? 'text-red-600 font-bold' : 'text-slate-400'}`}><Trophy size={24} /><span className="text-[10px]">結果</span></button>
        <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 ${view === 'admin' ? 'text-red-600 font-bold' : 'text-slate-400'}`}><Settings size={24} /><span className="text-[10px]">管理</span></button>
      </nav>

      <header className="bg-gradient-to-b from-red-700 to-red-800 text-yellow-400 p-8 text-center shadow-2xl border-b-4 border-yellow-500">
        <h1 className="text-3xl font-black tracking-widest uppercase">新春紅包大配對</h1>
      </header>

      <main className="max-w-4xl mx-auto mt-6 px-4">
        {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-2xl flex items-center gap-2 font-bold shadow-sm"><AlertCircle size={18} />{error}</div>}
        {success && <div className="mb-4 p-4 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center gap-2 font-bold shadow-sm"><CheckCircle size={18} />{success}</div>}

        {view === 'landing' && (
          <div className="max-w-md mx-auto bg-white p-10 rounded-[2rem] shadow-2xl text-center border-t-8 border-red-600 mt-4 animate-in fade-in zoom-in">
            <div className="text-8xl mb-8">🧧</div>
            <h2 className="text-2xl font-black text-red-900 mb-6 uppercase">新年大吉！緣分之旅</h2>
            <form onSubmit={handleJoin} className="space-y-6">
              <input type="text" value={currentNickname} onChange={(e) => setCurrentNickname(e.target.value)} placeholder="輸入您的暱稱" className="w-full p-4 bg-orange-50 border-2 border-red-50 rounded-2xl text-center text-xl font-black outline-none focus:border-red-500" />
              <button className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-red-700 active:scale-95 transition-all text-lg flex items-center justify-center gap-2">進入挑選 <ChevronRight size={20}/></button>
            </form>
          </div>
        )}

        {view === 'picking' && (
          <div className="max-w-2xl mx-auto mt-4 animate-in slide-in-from-bottom-8">
            <h3 className="text-center font-black text-red-800 text-xl mb-8">嗨 {currentNickname}，請挑一個好運位置</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {Array.from({ length: gameConfig.totalEnvelopes || 24 }).map((_, i) => {
                const p = participants.find(p => p.envelopeIndex === i);
                return (
                  <button key={i} disabled={!!p} onClick={() => handlePick(i)} className={`relative h-24 rounded-xl border-2 transition-all flex flex-col items-center justify-center shadow-md ${p?.uid === user?.uid ? 'bg-yellow-400 border-yellow-600 scale-105 z-10 shadow-lg' : p ? 'bg-gray-200 border-gray-300 opacity-40 grayscale' : 'bg-red-600 border-yellow-500 hover:scale-105'}`}>
                    {!p && <div className="absolute top-0 inset-x-0 h-4 bg-red-700 rounded-b-2xl border-b border-yellow-600/30"></div>}
                    <span className={`text-[9px] ${p?.uid === user?.uid ? 'text-yellow-800' : 'text-yellow-200/50'}`}>No.</span>
                    <span className={`text-xl font-black ${p?.uid === user?.uid ? 'text-red-700' : 'text-yellow-400'}`}>{i + 1}</span>
                    {!p && <div className="mt-0.5 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-[7px] text-red-800 border border-yellow-200 font-serif font-bold">福</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="max-w-md mx-auto bg-white p-8 rounded-[2rem] shadow-2xl border-t-8 border-red-600 space-y-6">
            {!isAdminAuthenticated ? (
              <div className="text-center py-8">
                <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-red-600 shadow-inner"><Lock size={48} /></div>
                <form onSubmit={(e) => { e.preventDefault(); if (adminPasswordInput === ADMIN_PASSWORD) setIsAdminAuthenticated(true); else setError('密碼錯誤'); }} className="space-y-6">
                  <input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="管理密碼" className="w-full p-4 border-2 border-red-100 rounded-xl text-center text-xl font-bold shadow-inner outline-none focus:border-red-500" />
                  <button className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-lg text-lg">驗證解鎖</button>
                </form>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in">
                <div className="flex justify-between items-center border-b-2 border-red-50 pb-2">
                  <h2 className="font-black text-red-900 uppercase">管理中心</h2>
                  <button onClick={() => setIsAdminAuthenticated(false)} className="text-xs text-red-400 underline">登出</button>
                </div>
                <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-black text-orange-700 uppercase">總額 (R)</label><input type="number" step="100" value={gameConfig.targetSum} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { targetSum: parseInt(e.target.value) || 0 })} className="w-full p-2 rounded-lg border-2 border-orange-200 text-center font-bold" /></div>
                    <div><label className="text-[10px] font-black text-orange-700 uppercase">數量</label><input type="number" value={gameConfig.totalEnvelopes} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { totalEnvelopes: parseInt(e.target.value) || 24 })} className="w-full p-2 rounded-lg border-2 border-orange-200 text-center font-bold" /></div>
                  </div>
                  <button onClick={generateEnvelopePool} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl shadow-md text-xs flex items-center justify-center gap-2"><Database size={14}/> 生成金額池</button>
                </div>
                <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100 space-y-3">
                  <button onClick={handleMatchAndShow} className="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-xl flex items-center justify-center gap-2"><Trophy size={20}/> 正式配對並公佈</button>
                  <div className="flex gap-2">
                    <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { showAllResults: !gameConfig.showAllResults })} className={`flex-1 py-2 rounded-xl font-bold border-2 transition-all ${gameConfig.showAllResults ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-slate-400'}`}>{gameConfig.showAllResults ? '隱藏名單' : '顯示名單'}</button>
                    <button onClick={resetGame} className="px-4 bg-white text-red-400 border-2 border-red-100 rounded-xl flex items-center justify-center"><RotateCcw size={18}/></button>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {participants.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 bg-white rounded-xl border border-red-50 text-xs shadow-sm">
                      <span className="font-bold text-slate-700">#{p.envelopeIndex+1} {p.name}</span>
                      <button onClick={() => deleteParticipant(p.id)} className="text-red-200 hover:text-red-500"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'results' && (
          <div className="pb-20 animate-in fade-in">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-black text-red-800 tracking-widest uppercase">緣分揭曉</h2>
              <p className="text-sm text-slate-400 mt-2 font-bold tracking-widest">✨ 點擊紅包查看金額，再次點擊收起</p>
            </div>

            <div className="space-y-16">
              {/* 個人紅包：大幅增加上方 Padding 以避開動畫重疊 */}
              {(() => {
                const myEnrollment = participants.find(p => p.uid === user?.uid);
                const myResult = finalPairs.find(p => p.p1.uid === user?.uid || (p.isPair && p.p2.uid === user?.uid));
                if (!myEnrollment) return <div className="max-w-md mx-auto bg-white p-12 rounded-[3rem] shadow-xl text-center border-t-8 border-red-600 font-bold text-red-800">您尚未挑選紅包</div>;
                const pData = myResult ? (myResult.p1.uid === user?.uid ? myResult.p1 : myResult.p2) : myEnrollment;
                return (
                  <div className="max-w-md mx-auto flex flex-col items-center bg-white pt-36 pb-12 px-8 rounded-[3rem] shadow-2xl border-4 border-yellow-500/40 relative animate-in zoom-in">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-red-900 px-10 py-3 rounded-full text-base font-black shadow-xl z-[100] border-4 border-yellow-200">您的專屬紅包</div>
                    <ResultEnvelope pData={pData} />
                    <div className="mt-12 text-center bg-red-50 px-8 py-6 rounded-3xl border-2 border-red-100 w-full shadow-inner relative z-10">
                      <p className="text-red-400 text-[10px] font-black tracking-widest uppercase opacity-80 mb-1">您的命中組合</p>
                      <p className="font-black text-red-800 text-2xl tracking-widest">
                        {myResult ? (myResult.isPair ? `${myResult.p1.name} ❤️ ${myResult.p2.name}` : `${myResult.p1.name} (大吉獨贏)`) : "等待開獎揭曉..."}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* 全體名單：響應式排版，減少空洞感 */}
              {gameConfig.showAllResults ? (
                <div className="animate-in fade-in slide-in-from-bottom-12">
                  <div className="flex items-center gap-6 mb-16">
                    <div className="h-px bg-red-200 flex-1"></div>
                    <span className="text-red-500 text-sm font-black tracking-[0.5em] uppercase">揭曉名單</span>
                    <div className="h-px bg-red-200 flex-1"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-32">
                    {finalPairs.map((pair, idx) => (
                      <div key={idx} className="bg-white/80 backdrop-blur-sm rounded-[3rem] pt-36 pb-14 px-8 border-2 border-red-100 shadow-xl relative group">
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-2 rounded-full text-xs font-black shadow-xl z-[100] border-2 border-red-400 tracking-widest uppercase">組合 #{idx+1}</div>
                        {pair.isPair ? (
                          <div className="flex flex-col gap-16 relative z-10">
                            <div className="grid grid-cols-2 gap-4 relative">
                              <ResultEnvelope pData={pair.p1} />
                              <ResultEnvelope pData={pair.p2} />
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl animate-pulse">❤️</div>
                            </div>
                            <div className="text-center font-black text-red-900 text-xl bg-gradient-to-r from-red-50 to-red-100 py-6 rounded-2xl border-2 border-red-200 shadow-inner">
                              {pair.p1.name} & {pair.p2.name}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-12 relative z-10">
                            <ResultEnvelope pData={pair.p1} />
                            <div className="text-center font-black text-amber-800 bg-amber-50 px-12 py-4 rounded-full border-2 border-amber-200 shadow-md text-xl tracking-widest uppercase">🌟 {pair.p1.name} 大吉大利</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-md mx-auto text-center p-20 bg-white/40 rounded-[3rem] border-4 border-dotted border-red-200 shadow-inner">
                  <Eye size={64} className="mx-auto text-red-200 mb-6" />
                  <p className="text-red-300 font-black text-xl tracking-[0.3em] uppercase">名單封存中</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #fee2e2; border-radius: 10px; }
        .perspective-1000 { perspective: 1000px; }
      `}</style>
    </div>
  );
};

export default App;