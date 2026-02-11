import React, { useState, useEffect } from 'react';
import { 
  Gift, ChevronRight, Trophy, AlertCircle, Settings, Users, Trash2, Lock, Unlock, Eye, EyeOff, RotateCcw
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'red-envelope-app'; 

// --- 遊戲常數 ---
const ADMIN_PASSWORD = "2026"; 

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); 
  const [participants, setParticipants] = useState([]);
  const [gameConfig, setGameConfig] = useState({ 
    targetSum: 6600, 
    status: 'collecting', 
    totalEnvelopes: 24,
    showAllResults: false 
  });
  const [finalPairs, setFinalPairs] = useState([]);
  const [currentNickname, setCurrentNickname] = useState('');
  const [error, setError] = useState('');
  const [revealedIds, setRevealedIds] = useState(new Set());
  
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setError('身份驗證失敗，請重新整理');
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGameConfig(prev => ({ ...prev, ...data }));
      } else {
        setDoc(configRef, { 
          targetSum: 6600, 
          status: 'collecting', 
          totalEnvelopes: 24,
          showAllResults: false 
        });
      }
    }, (err) => setError('設定讀取失敗'));

    const partsRef = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
    const unsubParts = onSnapshot(partsRef, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setParticipants(list);
    }, (err) => setError('參加者讀取失敗'));

    const pairsRef = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
    const unsubPairs = onSnapshot(pairsRef, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setFinalPairs(list);
    }, (err) => setError('配對結果讀取失敗'));

    return () => {
      unsubConfig();
      unsubParts();
      unsubPairs();
    };
  }, [user]);

  // 紙鈔與硬幣組合邏輯
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
    if (participants.some(p => p.name === currentNickname.trim())) {
      setError('暱稱已被使用');
      return;
    }
    setError('');
    setView('picking');
  };

  const handlePick = async (index) => {
    if (!user || participants.some(p => p.envelopeIndex === index)) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'participants'), {
        name: currentNickname.trim(),
        envelopeIndex: index,
        uid: user.uid,
        timestamp: Date.now()
      });
      setView('results');
    } catch (err) {
      setError('選擇失敗');
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

  // 管理者：刪除參加者 (加回來的函式)
  const deleteParticipant = async (pId) => {
    if (!window.confirm('確定要刪除這位參加者嗎？刪除後對應的紅包位置將會釋放。')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'participants', pId));
    } catch (err) {
      setError('刪除失敗');
    }
  };

  // 管理者：生成配對 (以 100 為單位)
  const handleMatch = async () => {
    if (!user || participants.length < 2) return;
    try {
      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const oldPairs = await getDocs(pairsColl);
      await Promise.all(oldPairs.docs.map(d => deleteDoc(d.ref)));

      let shuffled = [...participants].sort(() => Math.random() - 0.5);
      const target = Number(gameConfig.targetSum) || 6600;

      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
          const maxUnits = target / 100;
          const kUnits = Math.floor(Math.random() * (maxUnits - 1)) + 1; 
          const k = kUnits * 100;

          await addDoc(pairsColl, { 
            p1: { ...shuffled[i], value: k }, 
            p2: { ...shuffled[i+1], value: target - k }, 
            isPair: true 
          });
        } else {
          await addDoc(pairsColl, { p1: { ...shuffled[i], value: '福' }, isPair: false });
        }
      }

      const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
      await updateDoc(configRef, { status: 'finished', showAllResults: false });
      setError('');
    } catch (err) {
      setError('生成失敗');
    }
  };

  const resetGame = async () => {
    if (!user || !window.confirm('確定要清除所有資料並重新開始嗎？')) return;
    try {
      const partsColl = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
      const parts = await getDocs(partsColl);
      await Promise.all(parts.docs.map(d => deleteDoc(d.ref)));

      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const pairs = await getDocs(pairsColl);
      await Promise.all(pairs.docs.map(d => deleteDoc(d.ref)));

      const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
      await updateDoc(configRef, { status: 'collecting', showAllResults: false });
      setRevealedIds(new Set());
      setError('遊戲已完全重置');
    } catch (err) {
      setError('重置失敗');
    }
  };

  // --- UI 組件 ---
  const CashIcon = ({ item }) => {
    if (item.type === 'bill') {
      return (
        <div className={`${item.color} w-12 h-7 rounded-sm border flex items-center justify-center text-[9px] text-white font-black shadow-md animate-bounce`}>
          ${item.val}
        </div>
      );
    }
    return (
      <div className={`${item.color} w-7 h-7 rounded-full border flex items-center justify-center text-[9px] text-slate-800 font-black shadow-md animate-bounce`}>
        {item.val}
      </div>
    );
  };

  const PickEnvelope = ({ index, isTaken, isMine, onPick }) => (
    <button 
      disabled={isTaken} 
      onClick={() => onPick(index)} 
      className={`relative h-28 rounded-xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden shadow-md active:scale-95 group
        ${isMine ? 'bg-yellow-400 border-yellow-600 scale-105 z-10' : 
          isTaken ? 'bg-gray-200 border-gray-300 opacity-40 grayscale' : 
          'bg-red-600 border-yellow-500 hover:scale-105 hover:shadow-xl'}`}
    >
      {!isTaken && <div className="absolute top-0 inset-x-0 h-6 bg-red-700 rounded-b-2xl border-b border-yellow-600/30"></div>}
      <span className={`text-[10px] ${isMine ? 'text-yellow-800' : 'text-yellow-200/50'}`}>No.</span>
      <span className={`text-2xl font-black ${isMine ? 'text-red-700' : 'text-yellow-400'}`}>{index + 1}</span>
      {!isTaken && !isMine && <div className="mt-1 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-[8px] text-red-800 border border-yellow-200 shadow-inner font-serif">福</div>}
    </button>
  );

  const ResultEnvelope = ({ pData, showName = true }) => {
    const isRevealed = revealedIds.has(pData.id);
    const cashItems = getCashDetails(pData.value);

    return (
      <div className="flex flex-col items-center w-full">
        <div 
          onClick={() => toggleEnvelope(pData.id)}
          className="relative h-44 w-full max-w-[160px] cursor-pointer"
          style={{ perspective: '1000px' }}
        >
          {/* 鈔票硬幣彈出層 */}
          <div className={`absolute inset-x-2 transition-all duration-700 flex flex-col items-center ${isRevealed ? '-translate-y-24 opacity-100 scale-110' : 'translate-y-0 opacity-0'}`}>
            <div className="flex flex-wrap justify-center gap-1 mb-3 max-w-[140px]">
              {cashItems.map((item, i) => <CashIcon key={i} item={item} />)}
              {pData.value === '福' && <div className="text-5xl">🧧</div>}
            </div>
            <div className="bg-white px-4 py-1 rounded-full shadow-xl border-2 border-red-500 font-black text-red-600 whitespace-nowrap text-base">
              {pData.value === '福' ? '大吉大利' : `$${pData.value}`}
            </div>
          </div>

          {/* 紅包主體 */}
          <div className={`absolute inset-0 bg-red-600 rounded-xl border-2 border-yellow-500 shadow-xl z-10 flex flex-col items-center justify-center transition-transform duration-500 ${isRevealed ? 'translate-y-8 opacity-90 scale-95' : ''}`}>
            <div className="absolute top-0 w-full h-1/4 bg-red-700 rounded-b-3xl border-b border-yellow-600/30"></div>
            <div className="text-yellow-400 font-bold text-2xl mb-1">{(Number(pData.envelopeIndex) || 0) + 1}</div>
            <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-red-700 font-serif text-sm border-2 border-yellow-200 shadow-inner">福</div>
            <div className="mt-2 text-[10px] text-red-200 font-medium px-2 truncate w-full text-center">
              {showName ? String(pData.name) : '點擊查看'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-orange-50 text-slate-800 pb-32">
      {/* 導航欄 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-red-100 flex justify-around p-5 z-50 shadow-[0_-4px_25px_rgba(0,0,0,0.1)]">
        <button onClick={() => setView('landing')} className={`flex flex-col items-center gap-1 transition-all ${view === 'landing' || view === 'picking' ? 'text-red-600 scale-110 font-black' : 'text-slate-400 hover:text-red-300'}`}>
          <Gift size={26} /><span className="text-[10px]">抽取紅包</span>
        </button>
        <button onClick={() => setView('results')} className={`flex flex-col items-center gap-1 transition-all ${view === 'results' ? 'text-red-600 scale-110 font-black' : 'text-slate-400 hover:text-red-300'}`}>
          <Trophy size={26} /><span className="text-[10px]">配對結果</span>
        </button>
        <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 transition-all ${view === 'admin' ? 'text-red-600 scale-110 font-black' : 'text-slate-400 hover:text-red-300'}`}>
          <Settings size={26} /><span className="text-[10px]">管理者</span>
        </button>
      </nav>

      <header className="bg-gradient-to-b from-red-700 to-red-800 text-yellow-400 p-10 text-center shadow-2xl border-b-4 border-yellow-500 relative overflow-hidden">
        <h1 className="text-4xl font-black tracking-widest drop-shadow-lg">新春紅包大配對</h1>
        <div className="inline-block mt-4 px-5 py-1.5 bg-red-900/50 rounded-full text-xs text-red-100 border border-red-600/50 backdrop-blur-sm">
          已有 {participants.length} 人參與
        </div>
      </header>

      <main className="max-w-md mx-auto mt-8 px-5">
        {error && <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-2xl text-sm font-bold flex items-center gap-2 animate-bounce shadow-md"><AlertCircle size={18} />{String(error)}</div>}

        {/* 歡迎頁 */}
        {view === 'landing' && (
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl text-center border-t-8 border-red-600 mt-4 animate-in fade-in zoom-in duration-500">
            <div className="text-8xl mb-8">🧧</div>
            <h2 className="text-2xl font-black text-red-900 mb-2">新年大吉！緣分紅包</h2>
            <p className="text-slate-500 text-sm mb-10">輸入暱稱，開啟新春好運</p>
            <form onSubmit={handleJoin} className="space-y-6">
              <input type="text" value={currentNickname} onChange={(e) => setCurrentNickname(e.target.value)} placeholder="輸入您的暱稱" className="w-full p-5 bg-orange-50 border-2 border-red-50 rounded-[1.5rem] text-center text-xl font-black outline-none focus:border-red-500 focus:bg-white transition-all shadow-inner" />
              <button className="w-full bg-red-600 text-white font-black py-5 rounded-[1.5rem] shadow-xl hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-3 text-lg">
                開始挑選 <ChevronRight size={24}/>
              </button>
            </form>
          </div>
        )}

        {/* 抽紅包頁 */}
        {view === 'picking' && (
          <div className="mt-4">
            <h3 className="text-center font-black text-red-800 text-xl mb-8">嗨 {currentNickname}，請挑一個好運位置</h3>
            <div className="grid grid-cols-4 gap-4 animate-in slide-in-from-bottom-8 duration-500">
              {Array.from({ length: gameConfig.totalEnvelopes }).map((_, i) => {
                const p = participants.find(p => p.envelopeIndex === i);
                return <PickEnvelope key={i} index={i} isTaken={!!p} isMine={p?.uid === user?.uid} onPick={handlePick} />;
              })}
            </div>
          </div>
        )}

        {/* 管理頁 */}
        {view === 'admin' && (
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl border-t-8 border-red-600 space-y-8 mt-4">
            {!isAdminAuthenticated ? (
              <div className="text-center py-8 animate-in slide-in-from-top-4">
                <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-red-600 shadow-inner">
                  <Lock size={48} />
                </div>
                <h2 className="text-2xl font-black text-red-900 mb-6 tracking-widest">管理者驗證</h2>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (adminPasswordInput === ADMIN_PASSWORD) {
                    setIsAdminAuthenticated(true);
                    setError('');
                  } else {
                    setError('密碼不正確');
                    setAdminPasswordInput('');
                  }
                }} className="space-y-6">
                  <input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="管理密碼" className="w-full p-5 border-2 border-red-100 rounded-[1.2rem] text-center outline-none focus:border-red-500 text-xl font-bold" />
                  <button className="w-full bg-red-600 text-white font-black py-4 rounded-[1.2rem] shadow-lg flex items-center justify-center gap-2 text-lg">驗證解鎖</button>
                </form>
              </div>
            ) : (
              <div className="animate-in fade-in duration-500">
                <div className="flex justify-between items-center mb-8 pb-3 border-b-2 border-red-50">
                  <h2 className="text-2xl font-black text-red-900 flex items-center gap-3"><Settings size={24} className="text-red-600" /> 管理中心</h2>
                  <button onClick={() => setIsAdminAuthenticated(false)} className="text-sm font-bold text-red-400 bg-red-50 px-3 py-1 rounded-full">退出</button>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                  <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 shadow-sm">
                    <label className="text-xs font-black text-orange-700 block mb-2">目標總額 (R)</label>
                    <input type="number" step="100" value={gameConfig.targetSum} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { targetSum: parseInt(e.target.value) || 0 })} className="w-full p-3 rounded-xl border-2 border-orange-200 text-center font-black text-red-800 outline-none" />
                  </div>
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100 shadow-sm">
                    <label className="text-xs font-black text-red-700 block mb-2">紅包總量</label>
                    <input type="number" value={gameConfig.totalEnvelopes} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { totalEnvelopes: parseInt(e.target.value) || 24 })} className="w-full p-3 rounded-xl border-2 border-red-200 text-center font-black text-red-800 outline-none" />
                  </div>
                </div>

                <div className="my-10">
                  <p className="text-sm text-slate-400 font-black mb-4 flex items-center gap-2 px-2"><Users size={18}/> 報名清單 ({participants.length})</p>
                  <div className="max-h-60 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                    {participants.length === 0 ? (
                      <div className="text-center py-10 text-slate-300 italic">尚無參加者</div>
                    ) : (
                      participants.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:bg-white transition-colors">
                          <span className="font-black text-slate-700 text-base">#{p.envelopeIndex+1} {p.name}</span>
                          <button 
                            onClick={() => deleteParticipant(p.id)} 
                            className="text-red-300 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <button onClick={handleMatch} disabled={participants.length < 2} className="w-full bg-red-600 text-white font-black py-5 rounded-[1.2rem] shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all text-lg">正式配對並生成金額</button>
                  
                  <div className="flex gap-4">
                    <button 
                      onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { showAllResults: !gameConfig.showAllResults })} 
                      className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.2rem] font-black border-2 transition-all shadow-md ${gameConfig.showAllResults ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                    >
                      {gameConfig.showAllResults ? <><EyeOff size={22}/> 隱藏全體結果</> : <><Eye size={22}/> 公佈全體結果</>}
                    </button>
                    <button onClick={resetGame} className="px-5 bg-white text-red-400 border-2 border-red-100 rounded-[1.2rem] flex items-center justify-center hover:bg-red-50 transition-all shadow-md"><RotateCcw size={22}/></button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 結果頁 */}
        {view === 'results' && (
          <div className="mt-6 pb-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-black text-red-800 tracking-widest">緣分揭曉</h2>
              <p className="text-sm text-slate-400 mt-3 font-bold">
                {gameConfig.status === 'collecting' ? '⌛ 請耐心等待開獎...' : '✨ 點擊紅包查看金額'}
              </p>
            </div>

            {gameConfig.status === 'finished' ? (
              <div className="space-y-32">
                {/* 使用者個人紅包 */}
                {(() => {
                  const myPair = finalPairs.find(p => 
                    p.p1.uid === user?.uid || (p.isPair && p.p2.uid === user?.uid)
                  );
                  if (!myPair) return null;
                  
                  const myData = myPair.p1.uid === user?.uid ? myPair.p1 : myPair.p2;
                  return (
                    <div className="flex flex-col items-center bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-yellow-500/40 relative animate-in zoom-in duration-700">
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-yellow-500 text-red-900 px-6 py-2 rounded-full text-sm font-black shadow-xl tracking-widest">您的專屬紅包</div>
                      <ResultEnvelope pData={myData} />
                      <div className="mt-8 text-center bg-red-50 px-8 py-3 rounded-2xl border-2 border-red-100">
                        <p className="text-red-400 text-xs font-black mb-1">配對組合</p>
                        <p className="font-black text-red-800 text-2xl tracking-widest">
                          {myPair.isPair ? `${myPair.p1.name} ❤️ ${myPair.p2.name}` : `${myPair.p1.name} (大吉獨贏)`}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* 公佈全體結果 */}
                {gameConfig.showAllResults ? (
                  <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
                    <div className="flex items-center gap-6 mb-16">
                      <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                      <span className="text-red-500 text-sm font-black tracking-[0.3em] uppercase">全體名單</span>
                      <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                    </div>
                    
                    <div className="space-y-48"> {/* 加大組合間的間距 */}
                      {finalPairs.map((pair, idx) => (
                        <div key={idx} className="bg-white/70 backdrop-blur-md rounded-[3rem] p-12 border-2 border-red-50 shadow-lg transition-all hover:scale-[1.02]">
                          {pair.isPair ? (
                            <div className="flex flex-col gap-16">
                              <div className="grid grid-cols-2 gap-10 relative">
                                <ResultEnvelope pData={pair.p1} />
                                <ResultEnvelope pData={pair.p2} />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl animate-pulse filter drop-shadow-md">❤️</div>
                              </div>
                              <div className="text-center font-black text-red-900 text-2xl bg-gradient-to-r from-red-50 to-red-100 py-5 rounded-[1.5rem] border-2 border-red-200 shadow-inner">
                                {pair.p1.name} & {pair.p2.name}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-10">
                              <ResultEnvelope pData={pair.p1} />
                              <div className="text-center font-black text-amber-800 bg-amber-50 px-12 py-3 rounded-full border-2 border-amber-200 shadow-sm text-xl">
                                🌟 {pair.p1.name} 大吉大利
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-16 bg-white/40 rounded-[3rem] border-4 border-dotted border-red-200 shadow-inner">
                    <Eye size={48} className="mx-auto text-red-200 mb-6" />
                    <p className="text-red-300 font-black text-lg tracking-widest">全體配對結果尚未揭曉</p>
                    <p className="text-xs text-red-200 mt-3 font-bold italic">請靜候現場管理者公佈！</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-20 rounded-[4rem] shadow-2xl text-center border-t-8 border-red-600 mt-4 animate-pulse">
                <div className="text-8xl mb-10">🧧</div>
                <p className="font-black text-red-800 text-2xl tracking-[0.5em]">福氣滿袋</p>
                <p className="text-slate-400 text-sm mt-5 font-bold">當管理者開獎後，您將看到配對結果</p>
              </div>
            )}
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