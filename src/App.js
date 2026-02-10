import React, { useState, useEffect } from 'react';
import { 
  Gift, ChevronRight, Trophy, AlertCircle, Settings, Users, Trash2, Lock, Unlock
} from 'lucide-react'; // 修正：移除了未使用的 Sparkles
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, 
  onSnapshot, updateDoc, deleteDoc, getDocs, addDoc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- Firebase 配置 ---
// 請記得替換為您在 Firebase Console 取得的真實資訊
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

// --- 遊戲常數 ---
const TOTAL_ENVELOPES = 24;
const ADMIN_PASSWORD = "2026"; // 您可以在這裡修改管理員密碼

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); 
  const [participants, setParticipants] = useState([]);
  const [gameConfig, setGameConfig] = useState({ targetSum: 88, status: 'collecting' });
  const [finalPairs, setFinalPairs] = useState([]);
  const [currentNickname, setCurrentNickname] = useState('');
  const [error, setError] = useState('');
  const [revealedIds, setRevealedIds] = useState(new Set());
  
  // 管理員驗證狀態
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // 初始化驗證
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

  // 監聽雲端資料
  useEffect(() => {
    if (!user) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config');
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) setGameConfig(docSnap.data());
      else setDoc(configRef, { targetSum: 88, status: 'collecting' });
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

  const getCoins = (value) => {
    if (typeof value !== 'number') return [];
    let remaining = value;
    const coins = [];
    [50, 10, 5, 1].forEach(denom => {
      const count = Math.floor(remaining / denom);
      for (let i = 0; i < count; i++) coins.push(denom);
      remaining %= denom;
    });
    return coins;
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

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      setError('');
    } else {
      setError('密碼錯誤，請重新輸入');
      setAdminPasswordInput('');
    }
  };

  const deleteParticipant = async (pId) => {
    if (!window.confirm('確定要刪除這位參加者嗎？')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'participants', pId));
    } catch (err) {
      setError('刪除失敗');
    }
  };

  const handleMatch = async () => {
    if (!user || participants.length < 2) return;
    try {
      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const oldPairs = await getDocs(pairsColl);
      await Promise.all(oldPairs.docs.map(d => deleteDoc(d.ref)));

      let shuffled = [...participants].sort(() => Math.random() - 0.5);
      const target = Number(gameConfig.targetSum) || 88;

      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
          const k = Math.floor(Math.random() * (target - 10)) + 5;
          await addDoc(pairsColl, { 
            p1: { ...shuffled[i], value: k }, 
            p2: { ...shuffled[i+1], value: target - k }, 
            isPair: true 
          });
        } else {
          await addDoc(pairsColl, { p1: { ...shuffled[i], value: '福' }, isPair: false });
        }
      }

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { status: 'finished' });
    } catch (err) {
      setError('生成失敗');
    }
  };

  const resetGame = async () => {
    if (!user || !window.confirm('確定要重置所有資料嗎？')) return;
    try {
      const partsColl = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
      const parts = await getDocs(partsColl);
      await Promise.all(parts.docs.map(d => deleteDoc(d.ref)));

      const pairsColl = collection(db, 'artifacts', appId, 'public', 'data', 'pairs');
      const pairs = await getDocs(pairsColl);
      await Promise.all(pairs.docs.map(d => deleteDoc(d.ref)));

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { status: 'collecting' });
      setError('資料已清空');
    } catch (err) {
      setError('重置失敗');
    }
  };

  const CoinIcon = ({ val }) => {
    const colors = {
      50: 'bg-yellow-500 border-yellow-300 text-yellow-900',
      10: 'bg-slate-300 border-slate-100 text-slate-700',
      5: 'bg-slate-400 border-slate-200 text-slate-100',
      1: 'bg-orange-400 border-orange-200 text-orange-900'
    };
    return (
      <div className={`${colors[val] || 'bg-gray-400'} rounded-full border-2 flex items-center justify-center font-bold shadow-sm w-7 h-7 text-[10px] animate-bounce`}>
        {val}
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

  const ResultEnvelope = ({ pData }) => {
    const isRevealed = revealedIds.has(pData.id);
    const coins = getCoins(pData.value);

    return (
      <div 
        onClick={() => setRevealedIds(prev => new Set(prev).add(pData.id))}
        className="relative h-44 w-full cursor-pointer"
        style={{ perspective: '1000px' }}
      >
        <div className={`absolute inset-x-2 transition-all duration-1000 flex flex-col items-center ${isRevealed ? '-translate-y-16 opacity-100' : 'translate-y-0 opacity-0'}`}>
          <div className="flex flex-wrap justify-center gap-1 mb-2">
            {coins.map((c, i) => <CoinIcon key={i} val={c} />)}
            {pData.value === '福' && <div className="text-3xl">🧧</div>}
          </div>
          <div className="bg-white px-3 py-1 rounded-full shadow-lg border-2 border-red-500 font-black text-red-600 whitespace-nowrap">
            {pData.value === '福' ? '大吉大利' : `$${pData.value}`}
          </div>
        </div>

        <div className={`absolute inset-0 bg-red-600 rounded-xl border-2 border-yellow-500 shadow-xl z-10 flex flex-col items-center justify-center transition-transform ${isRevealed ? 'translate-y-6 opacity-90' : ''}`}>
          <div className="absolute top-0 w-full h-1/4 bg-red-700 rounded-b-3xl border-b border-yellow-600/30"></div>
          <div className="text-yellow-400 font-bold text-2xl mb-1">{(Number(pData.envelopeIndex) || 0) + 1}</div>
          <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center text-red-700 font-serif text-sm border-2 border-yellow-200 shadow-inner">福</div>
          <div className="mt-2 text-[10px] text-red-200 font-medium px-2 truncate w-full text-center">{String(pData.name)}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-orange-50 text-slate-800 pb-24">
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-red-100 flex justify-around p-3 z-50 shadow-lg">
        <button onClick={() => setView('landing')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'landing' || view === 'picking' ? 'text-red-600 font-bold' : 'text-slate-400 hover:text-red-300'}`}>
          <Gift size={22} /><span className="text-[10px]">抽紅包</span>
        </button>
        <button onClick={() => setView('results')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'results' ? 'text-red-600 font-bold' : 'text-slate-400 hover:text-red-300'}`}>
          <Trophy size={22} /><span className="text-[10px]">配對結果</span>
        </button>
        <button onClick={() => setView('admin')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'admin' ? 'text-red-600 font-bold' : 'text-slate-400 hover:text-red-300'}`}>
          <Settings size={22} /><span className="text-[10px]">管理</span>
        </button>
      </nav>

      <header className="bg-gradient-to-b from-red-700 to-red-800 text-yellow-400 p-8 text-center shadow-xl border-b-4 border-yellow-500 relative">
        <h1 className="text-3xl font-black tracking-widest drop-shadow-md">新春紅包大配對</h1>
        <div className="inline-block mt-3 px-4 py-1 bg-red-900/50 rounded-full text-xs text-red-100 border border-red-600/50 backdrop-blur-sm">
          目前已有 {participants.length} 人參加
        </div>
      </header>

      <main className="max-w-md mx-auto mt-6 px-4">
        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-xl text-sm flex items-center gap-2"><AlertCircle size={16} />{String(error)}</div>}

        {view === 'landing' && (
          <div className="bg-white p-8 rounded-3xl shadow-xl text-center border-t-8 border-red-600 mt-4">
            <div className="text-6xl mb-4">🧧</div>
            <h2 className="text-xl font-bold text-red-900 mb-2">新年快樂！緣分紅包</h2>
            <form onSubmit={handleJoin} className="space-y-5">
              <input type="text" value={currentNickname} onChange={(e) => setCurrentNickname(e.target.value)} placeholder="輸入您的暱稱" className="w-full p-4 bg-orange-50 border-2 border-red-50 rounded-2xl text-center text-lg font-bold outline-none focus:border-red-500 focus:bg-white transition-all shadow-inner" />
              <button className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2">進入挑選 <ChevronRight size={20}/></button>
            </form>
          </div>
        )}

        {view === 'picking' && (
          <div className="mt-2 grid grid-cols-4 gap-3">
            {Array.from({ length: TOTAL_ENVELOPES }).map((_, i) => {
              const p = participants.find(p => p.envelopeIndex === i);
              return <PickEnvelope key={i} index={i} isTaken={!!p} isMine={p?.uid === user?.uid} onPick={handlePick} />;
            })}
          </div>
        )}

        {view === 'admin' && (
          <div className="bg-white p-6 rounded-3xl shadow-xl border-t-8 border-red-600 space-y-5 mt-4">
            {!isAdminAuthenticated ? (
              <div className="text-center py-6">
                <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                  <Lock size={32} />
                </div>
                <h2 className="text-xl font-bold text-red-900 mb-4">存取受限</h2>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <input 
                    type="password" 
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="請輸入管理密碼" 
                    className="w-full p-4 border-2 border-red-100 rounded-2xl text-center outline-none focus:border-red-500 shadow-inner"
                  />
                  <button className="w-full bg-red-600 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2">
                    <Unlock size={18} /> 解鎖管理介面
                  </button>
                </form>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center border-b pb-3">
                  <h2 className="text-xl font-bold text-red-900 flex items-center gap-2"><Settings size={20} className="text-red-600" /> 管理者中心</h2>
                  <button onClick={() => setIsAdminAuthenticated(false)} className="text-xs text-red-400 font-bold border border-red-100 px-2 py-1 rounded-lg">登出</button>
                </div>
                
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                  <label className="text-xs font-bold text-orange-700 block mb-2">每組合目標總額 (R)</label>
                  <input type="number" value={gameConfig.targetSum} onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { targetSum: parseInt(e.target.value) || 0 })} className="w-full p-3 rounded-xl border-2 border-orange-200 text-center font-bold text-red-800 outline-none" />
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-bold flex items-center gap-1 px-1 mb-2"><Users size={12}/> 目前名單 ({participants.length})</p>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {participants.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                        <span className="font-bold text-red-900 text-sm">#{p.envelopeIndex+1} {p.name}</span>
                        <button onClick={() => deleteParticipant(p.id)} className="p-2 text-red-300 hover:text-red-600"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <button onClick={handleMatch} disabled={participants.length < 2} className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl shadow-lg disabled:bg-slate-200 active:scale-95 transition-all">正式生成配對結果</button>
                  <button onClick={resetGame} className="w-full py-2 text-red-300 text-xs hover:text-red-500 font-medium">清除所有資料</button>
                </div>
              </>
            )}
          </div>
        )}

        {view === 'results' && (
          <div className="space-y-8 mt-2 pb-10">
            <div className="text-center">
              <h2 className="text-2xl font-black text-red-800 tracking-wider">配對大揭曉</h2>
              <p className="text-xs text-slate-400 mt-2 font-medium">{gameConfig.status === 'collecting' ? '⌛ 請耐心等待管理者開啟配對...' : '✨ 點擊您的紅包查看金額與組合！'}</p>
            </div>
            {gameConfig.status === 'finished' ? (
              <>
                <div className="grid grid-cols-2 gap-y-20 gap-x-6 pt-10">
                  {finalPairs.flatMap(pair => pair.isPair ? [pair.p1, pair.p2] : [pair.p1]).map((p, idx) => <ResultEnvelope key={idx} pData={p} />)}
                </div>
                <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-red-100 space-y-4">
                  <h3 className="font-bold text-red-800 border-b pb-3 flex items-center gap-2"><Users size={18} className="text-red-600" /> 配對清單</h3>
                  <div className="space-y-3">
                    {finalPairs.map((pair, idx) => (
                      <div key={idx} className={`p-4 rounded-2xl flex items-center justify-between ${pair.isPair ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md' : 'bg-orange-100 text-orange-800 border border-orange-200'}`}>
                        {pair.isPair ? <><div className="flex-1 text-center font-black truncate text-sm">{pair.p1.name}</div><div className="px-3 text-yellow-300 animate-pulse text-xl">❤️</div><div className="flex-1 text-center font-black truncate text-sm">{pair.p2.name}</div></> : <div className="w-full text-center font-bold text-sm">🌟 {pair.p1.name} 獲得專屬大吉利</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : <div className="bg-white p-16 rounded-3xl shadow-xl text-center border-t-8 border-red-600 mt-4"><div className="text-7xl animate-bounce mb-8">🧧</div><p className="font-bold text-red-800 text-lg tracking-widest">紅包已準備好！</p></div>}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;