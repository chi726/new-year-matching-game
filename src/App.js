import React, { useState, useEffect } from 'react';
import { 
  Gift, ChevronRight, Trophy, AlertCircle, Settings, Users, Trash2, Lock, Eye, EyeOff, RotateCcw, CheckCircle
} from 'lucide-react'; // 修正：補上了漏掉的 EyeOff 引用
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
    showAllResults: false 
  });
  const [finalPairs, setFinalPairs] = useState([]);
  const [currentNickname, setCurrentNickname] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revealedIds, setRevealedIds] = useState(new Set());
  
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        setError('身分驗證失敗，請檢查網路連線');
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
        setGameConfig(docSnap.data());
      } else {
        setDoc(configRef, { 
          targetSum: 6600, 
          status: 'collecting', 
          totalEnvelopes: 24,
          showAllResults: false 
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
      setError('此暱稱已被使用');
      return;
    }
    setError('');
    setView('picking');
  };

  const handlePick = async (index) => {
    if (!user || participants.some(p => p.envelopeIndex === index)) return;
    try {
      const initialValue = (Math.floor(Math.random() * 26) + 5) * 100;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'participants'), {
        name: currentNickname.trim(),
        envelopeIndex: index,
        uid: user.uid,
        value: initialValue,
        timestamp: Date.now()
      });
      setView('results');
    } catch (err) {
      setError('選取失敗');
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

  // 管理者：【一鍵配對並公佈】
  const handleMatchAndShow = async () => {
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
          const val1 = kUnits * 100;
          const val2 = target - val1;

          await addDoc(pairsColl, { 
            p1: { ...shuffled[i], value: val1 }, 
            p2: { ...shuffled[i+1], value: val2 }, 
            isPair: true 
          });
        } else {
          await addDoc(pairsColl, { p1: { ...shuffled[i], value: '福' }, isPair: false });
        }
      }
      // 直接將結果狀態設為完成且顯示全體結果
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
        status: 'finished',
        showAllResults: true 
      });
      setSuccess('大揭曉！配對結果已公佈至所有人螢幕。');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('執行配對失敗');
    }
  };

  // 管理者：重新生成所有人的隨機金額（更改設定時使用）
  const regenerateAmounts = async () => {
    if (!participants.length) return;
    try {
      const partsColl = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
      await Promise.all(participants.map(p => {
        const newVal = (Math.floor(Math.random() * 26) + 5) * 100;
        return updateDoc(doc(partsColl, p.id), { value: newVal });
      }));
      setSuccess('基礎金額已根據最新設定重新生成！');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('更新失敗');
    }
  };

  const resetGame = async () => {
    if (!user || !window.confirm('確定要重置遊戲嗎？這將清空所有名單！')) return;
    try {
      const partsColl = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
      const parts = await getDocs(partsColl);
      await Promise.all(parts.docs.map(d => deleteDoc(d.ref)));

      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const pairs = await getDocs(pairsColl);
      await Promise.all(pairs.docs.map(d => deleteDoc(d.ref)));

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
        status: 'collecting', 
        showAllResults: false 
      });
      setRevealedIds(new Set());
      setSuccess('遊戲已重置，現在可以重新報名。');
    } catch (err) {
      setError('重置失敗');
    }
  };

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

  const ResultEnvelope = ({ pData, showName = true }) => {
    const displayId = pData.id || pData.uid;
    const isRevealed = revealedIds.has(displayId);
    const cashItems = getCashDetails(pData.value);

    return (
      <div className="flex flex-col items-center w-full">
        <div 
          onClick={() => toggleEnvelope(displayId)}
          className="relative h-44 w-full max-w-[160px] cursor-pointer"
          style={{ perspective: '1000px' }}
        >
          <div className={`absolute inset-x-2 transition-all duration-700 flex flex-col items-center ${isRevealed ? '-translate-y-24 opacity-100 scale-110' : 'translate-y-0 opacity-0'}`}>
            {pData.value ? (
              <>
                <div className="flex flex-wrap justify-center gap-1 mb-3 max-w-[140px]">
                  {cashItems.map((item, i) => <CashIcon key={i} item={item} />)}
                  {pData.value === '福' && <div className="text-5xl">🧧</div>}
                </div>
                <div className="bg-white px-4 py-1 rounded-full shadow-xl border-2 border-red-50 font-black text-red-600 whitespace-nowrap text-base shadow-red-200/50">
                  {pData.value === '福' ? '大吉大利' : `$${pData.value}`}
                </div>
              </>
            ) : (
              <div className="bg-white/90 px-4 py-2 rounded-2xl shadow-lg border border-red-200 text-red-400 font-bold text-xs animate-pulse">
                等待開獎...
              </div>
            )}
          </div>

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

      <header className="bg-gradient-to-b from-red-700 to-red-800 text-yellow-400 p-10 text-center shadow-2xl border-b-4 border-yellow-500 relative">
        <h1 className="text-4xl font-black tracking-widest drop-shadow-lg">新春紅包大配對</h1>
        <div className="inline-block mt-4 px-5 py-1.5 bg-red-900/50 rounded-full text-xs text-red-100 border border-red-600/50 backdrop-blur-sm">
          已有 {participants.length} 人參與
        </div>
      </header>

      <main className="max-w-md mx-auto mt-8 px-5">
        {error && <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-md"><AlertCircle size={18} />{String(error)}</div>}
        {success && <div className="mb-6 p-4 bg-emerald-100 text-emerald-700 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-md animate-pulse"><CheckCircle size={18} />{String(success)}</div>}

        {view === 'landing' && (
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl text-center border-t-8 border-red-600 mt-4 animate-in fade-in zoom-in duration-500">
            <div className="text-8xl mb-8">🧧</div>
            <h2 className="text-2xl font-black text-red-900 mb-2">新年大吉！緣分紅包</h2>
            <p className="text-slate-500 text-sm mb-10">輸入暱稱，開啟新春好運</p>
            <form onSubmit={handleJoin} className="space-y-6">
              <input type="text" value={currentNickname} onChange={(e) => setCurrentNickname(e.target.value)} placeholder="輸入您的暱稱" className="w-full p-5 bg-orange-50 border-2 border-red-50 rounded-[1.5rem] text-center text-xl font-black outline-none focus:border-red-500 focus:bg-white shadow-inner" />
              <button className="w-full bg-red-600 text-white font-black py-5 rounded-[1.5rem] shadow-xl hover:bg-red-700 active:scale-95 flex items-center justify-center gap-3 text-lg">開始挑選 <ChevronRight size={24}/></button>
            </form>
          </div>
        )}

        {view === 'picking' && (
          <div className="mt-4 animate-in slide-in-from-bottom-8 duration-500">
            <h3 className="text-center font-black text-red-800 text-xl mb-8">嗨 {currentNickname}，請挑一個位置</h3>
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: gameConfig.totalEnvelopes || 24 }).map((_, i) => {
                const p = participants.find(p => p.envelopeIndex === i);
                return (
                  <button key={i} disabled={!!p} onClick={() => handlePick(i)} className={`relative h-28 rounded-xl border-2 transition-all flex flex-col items-center justify-center shadow-md active:scale-95 ${p?.uid === user?.uid ? 'bg-yellow-400 border-yellow-600 scale-105 z-10 shadow-lg' : p ? 'bg-gray-200 border-gray-300 opacity-40 grayscale' : 'bg-red-600 border-yellow-500 hover:scale-105'}`}>
                    {!p && <div className="absolute top-0 inset-x-0 h-6 bg-red-700 rounded-b-2xl border-b border-yellow-600/30"></div>}
                    <span className={`text-[10px] ${p?.uid === user?.uid ? 'text-yellow-800' : 'text-yellow-200/50'}`}>No.</span>
                    <span className={`text-2xl font-black ${p?.uid === user?.uid ? 'text-red-700' : 'text-yellow-400'}`}>{i + 1}</span>
                    {!p && <div className="mt-1 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-[8px] text-red-800 border border-yellow-200 shadow-inner font-bold">福</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'admin' && (
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl border-t-8 border-red-600 space-y-8 mt-4">
            {!isAdminAuthenticated ? (
              <div className="text-center py-8">
                <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-red-600 shadow-inner"><Lock size={48} /></div>
                <h2 className="text-2xl font-black text-red-900 mb-6 tracking-widest">管理者驗證</h2>
                <form onSubmit={(e) => { e.preventDefault(); if (adminPasswordInput === ADMIN_PASSWORD) setIsAdminAuthenticated(true); else setError('密碼不正確'); }} className="space-y-6">
                  <input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} placeholder="管理密碼" className="w-full p-5 border-2 border-red-100 rounded-[1.2rem] text-center outline-none focus:border-red-500 text-xl font-bold" />
                  <button className="w-full bg-red-600 text-white font-black py-4 rounded-[1.2rem] shadow-lg text-lg">驗證解鎖</button>
                </form>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-8 pb-3 border-b-2 border-red-50">
                  <h2 className="text-2xl font-black text-red-900 flex items-center gap-3"><Settings size={24} className="text-red-600" /> 管理中心</h2>
                  <button onClick={() => setIsAdminAuthenticated(false)} className="text-sm font-bold text-red-400 bg-red-50 px-3 py-1 rounded-full">退出管理</button>
                </div>
                
                {/* 1. 基礎設定區 */}
                <div className="bg-orange-50/50 p-6 rounded-3xl border border-orange-100 mb-8">
                  <h3 className="text-sm font-black text-orange-800 mb-4 flex items-center gap-2">1. 系統設定</h3>
                  <div className="grid grid-cols-2 gap-5 mb-5">
                    <div>
                      <label className="text-[10px] font-black text-orange-700 block mb-1 tracking-widest uppercase">目標配對總額</label>
                      <input type="number" step="100" value={gameConfig.targetSum} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { targetSum: parseInt(e.target.value) || 0 })} className="w-full p-3 rounded-xl border-2 border-orange-200 text-center font-black text-red-800 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-orange-700 block mb-1 tracking-widest uppercase">紅包總格數</label>
                      <input type="number" value={gameConfig.totalEnvelopes} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { totalEnvelopes: parseInt(e.target.value) || 24 })} className="w-full p-3 rounded-xl border-2 border-orange-200 text-center font-black text-red-800 outline-none" />
                    </div>
                  </div>
                  <button onClick={regenerateAmounts} disabled={!participants.length} className="w-full bg-orange-600 text-white font-black py-3 rounded-xl shadow-md active:scale-95 text-xs">更新設定並重算初始金額</button>
                </div>

                <p className="text-sm text-slate-400 font-black mb-4 flex items-center gap-2"><Users size={18}/> 報名清單 ({participants.length})</p>
                <div className="max-h-60 overflow-y-auto space-y-3 mb-10 pr-2 custom-scrollbar">
                  {participants.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="font-black text-slate-700 text-sm">#{p.envelopeIndex+1} {p.name} (${p.value})</span>
                      <button onClick={() => deleteParticipant(p.id)} className="text-red-300 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={20} /></button>
                    </div>
                  ))}
                </div>

                {/* 2. 執行配對區 - 結合按鈕 */}
                <div className="bg-red-50/50 p-6 rounded-[2rem] border border-red-100 shadow-inner">
                  <h3 className="text-sm font-black text-red-800 mb-5 flex items-center gap-2">2. 最終操作</h3>
                  <div className="space-y-4">
                    {/* 配對與公佈結合 */}
                    <button 
                      onClick={handleMatchAndShow} 
                      disabled={participants.length < 2} 
                      className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white font-black py-6 rounded-[1.5rem] shadow-xl active:scale-95 transition-all text-xl flex items-center justify-center gap-3 border-b-4 border-red-900"
                    >
                      <Trophy size={24} /> 正式配對並公佈全體結果
                    </button>
                    
                    <div className="flex gap-4">
                      {/* 獨立切換顯示開關，防止誤點後想收回 */}
                      <button 
                        onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { showAllResults: !gameConfig.showAllResults })} 
                        className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[1.2rem] font-black border-2 transition-all shadow-md ${gameConfig.showAllResults ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                      >
                        {gameConfig.showAllResults ? <><EyeOff size={22}/> 隱藏結果</> : <><Eye size={22}/> 顯示結果</>}
                      </button>
                      <button onClick={resetGame} className="px-5 bg-white text-red-400 border-2 border-red-100 rounded-[1.2rem] flex items-center justify-center shadow-md active:bg-red-50 transition-colors"><RotateCcw size={22}/></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'results' && (
          <div className="mt-6 pb-20 animate-in fade-in duration-700">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-black text-red-800 tracking-widest">緣分揭曉</h2>
              <p className="text-sm text-slate-400 mt-3 font-bold">✨ 點擊紅包查看金額，再次點擊收起</p>
            </div>

            <div className="space-y-40">
              {/* 【個人專屬紅包區】：pt-48 避讓動畫 */}
              {(() => {
                const myResult = finalPairs.find(p => p.p1.uid === user?.uid || (p.isPair && p.p2.uid === user?.uid));
                const myEnrollment = participants.find(p => p.uid === user?.uid);
                
                if (!myEnrollment && !myResult) return (
                  <div className="bg-white p-16 rounded-[4rem] shadow-xl text-center border-t-8 border-red-600">
                    <div className="text-8xl mb-10">🧧</div>
                    <p className="font-black text-red-800 text-2xl tracking-widest uppercase">您尚未參加</p>
                    <p className="text-slate-400 text-sm mt-5">請返回抽取頁面挑選紅包</p>
                  </div>
                );

                const pData = myResult 
                  ? (myResult.p1.uid === user?.uid ? myResult.p1 : myResult.p2)
                  : myEnrollment;

                return (
                  <div className="flex flex-col items-center bg-white pt-48 pb-10 px-10 rounded-[3rem] shadow-2xl border-4 border-yellow-500/40 relative animate-in zoom-in duration-700 mb-12">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-red-900 px-8 py-2.5 rounded-full text-sm font-black shadow-xl tracking-widest z-50 border-2 border-yellow-200">您的專屬紅包</div>
                    <ResultEnvelope pData={pData} />
                    <div className="mt-12 text-center bg-red-50 px-8 py-5 rounded-3xl border-2 border-red-100 w-full shadow-inner">
                      <p className="text-red-400 text-xs font-black mb-1 tracking-wider uppercase">您的配對組合</p>
                      <p className="font-black text-red-800 text-2xl tracking-widest">
                        {myResult ? (myResult.isPair ? `${myResult.p1.name} ❤️ ${myResult.p2.name}` : `${myResult.p1.name} (大吉獨贏)`) : "等待管理者揭曉中..."}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* 【全體揭曉區】：空間感極大化 */}
              {gameConfig.showAllResults ? (
                <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
                  <div className="flex items-center gap-6 mb-24">
                    <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                    <span className="text-red-500 text-sm font-black tracking-[0.4em] uppercase">命中注定揭曉</span>
                    <div className="h-px bg-red-200 flex-1 shadow-sm"></div>
                  </div>
                  
                  <div className="space-y-[32rem]"> {/* 超大幅度拉開間距，避免滾動重疊感 */}
                    {finalPairs.length > 0 ? finalPairs.map((pair, idx) => (
                      <div key={idx} className="bg-white/80 backdrop-blur-md rounded-[3.5rem] pt-48 pb-12 px-12 border-2 border-red-100 shadow-2xl transition-all relative">
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-600 text-white px-8 py-2 rounded-full text-xs font-black shadow-xl z-40 border-2 border-red-400">緣分組合 #{idx+1}</div>
                        {pair.isPair ? (
                          <div className="flex flex-col gap-28">
                            <div className="grid grid-cols-2 gap-12 relative">
                              <ResultEnvelope pData={pair.p1} />
                              <ResultEnvelope pData={pair.p2} />
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl animate-pulse filter drop-shadow-md">❤️</div>
                            </div>
                            <div className="text-center font-black text-red-900 text-2xl bg-gradient-to-r from-red-50 to-red-100 py-8 rounded-[2.5rem] border-2 border-red-200 shadow-inner">
                              {pair.p1.name} & {pair.p2.name}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-14">
                            <ResultEnvelope pData={pair.p1} />
                            <div className="text-center font-black text-amber-800 bg-amber-50 px-14 py-4 rounded-full border-2 border-amber-200 shadow-md text-2xl">
                              🌟 {pair.p1.name} 大吉大利
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="text-center py-24 bg-white/40 rounded-[3rem] border-2 border-dashed border-red-300">
                        <p className="text-red-400 font-black text-lg">等待管理者執行配對動作</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center p-20 bg-white/40 rounded-[4rem] border-4 border-dotted border-red-200 shadow-inner">
                  <Eye size={56} className="mx-auto text-red-200 mb-8" />
                  <p className="text-red-300 font-black text-xl tracking-widest uppercase">全體名單封印中</p>
                  <p className="text-xs text-red-200 mt-3 font-bold">請關注管理者進行揭曉！</p>
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