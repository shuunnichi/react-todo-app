import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Quick Pin & Click Todo
// Single-file React component (default export). Designed to be dropped into a CRA/Vite project as App.jsx.

export default function QuickPinClickTodo() {
  // --- Helpers ---
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const formatISO = (d) => d?.slice(0, 10) ?? null;
  const nowISOTime = () => new Date().toISOString();

  // --- Storage keys ---
  const STORAGE_TASKS = "tasks";
  const STORAGE_PINS = "pins";

  // --- State ---
  const [tasks, setTasks] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_TASKS);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  });

  const [pins, setPins] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PINS);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  });

  // selectedDate: string YYYY-MM-DD or null meaning "no date"
  const [selectedDate, setSelectedDate] = useState(null);
  const [inputTitle, setInputTitle] = useState("");
  const [editId, setEditId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // task id that is in deletion pending
  
  const [showPinsAll, setShowPinsAll] = useState(false);
  const [overflowPinIndex, setOverflowPinIndex] = useState(Infinity);

  const [preEditState, setPreEditState] = useState({ title: "", date: null });


  // Undo/Redo history
  const MAX_HISTORY = 50;
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);

  // For focusing input & pin area
  const inputRef = useRef(null);
  const pinAreaRef = useRef(null);

  // Initialize - auto clean completed tasks older than yesterday
  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yISO = yesterday.toISOString().slice(0, 10);
    const cleaned = tasks.filter((t) => !(t.isDone && t.dueDate && t.dueDate <= yISO));
    if (cleaned.length !== tasks.length) {
      saveState({ tasks: cleaned, pins }, true);
      setTasks(cleaned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage every time tasks or pins change
  useEffect(() => {
    localStorage.setItem(STORAGE_TASKS, JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem(STORAGE_PINS, JSON.stringify(pins));
  }, [pins]);

  // Save current full state into history (for undo/redo)
  function pushHistory(snapshot) {
    const h = historyRef.current;
    const idx = historyIndexRef.current;
    const newArr = h.slice(0, idx + 1);
    newArr.push(JSON.parse(JSON.stringify(snapshot)));
    if (newArr.length > MAX_HISTORY) newArr.shift();
    historyRef.current = newArr;
    historyIndexRef.current = newArr.length - 1;
  }
  function saveState(stateObj, skipPush = false) {
    if (!skipPush) pushHistory({ tasks: stateObj.tasks || tasks, pins: stateObj.pins || pins });
    if (stateObj.tasks) setTasks(stateObj.tasks);
    if (stateObj.pins) setPins(stateObj.pins);
  }

  // Undo/Redo handlers
  useEffect(() => {
    const handler = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const z = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "z";
      const y = (isMac ? (e.metaKey && e.shiftKey) : e.ctrlKey) && e.key.toLowerCase() === "y";
      if (z) { e.preventDefault(); undo(); }
      else if (y) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function undo() {
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    const prev = historyRef.current[idx - 1];
    historyIndexRef.current = idx - 1;
    if (prev) { setTasks(prev.tasks); setPins(prev.pins); }
  }
  function redo() {
    const idx = historyIndexRef.current;
    if (idx < 0) return;
    if (idx + 1 >= historyRef.current.length) return;
    const next = historyRef.current[idx + 1];
    historyIndexRef.current = idx + 1;
    if (next) { setTasks(next.tasks); setPins(next.pins); }
  }

  // Document click to cancel delete-pending
  useEffect(() => {
    const onDocClick = (e) => {
      if (!pendingDelete) return;
      let el = e.target;
      while (el) {
        if (el.dataset && el.dataset.pendingId && el.dataset.pendingId === String(pendingDelete)) return;
        el = el.parentElement;
      }
      setPendingDelete(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [pendingDelete]);

  // --- Task operations ---
  function addTaskFromInput() {
    if (!inputTitle.trim()) return flashInputError();
    const t = { id: Date.now(), title: inputTitle.trim(), isDone: false, dueDate: selectedDate, createdAt: nowISOTime(), completedAt: null };
    saveState({ tasks: [...tasks, t] });
    setInputTitle("");
    setEditId(null);
    inputRef.current?.focus();
  }

  function toggleDone(t) {
    const updated = tasks.map((task) => (task.id !== t.id ? task : { ...task, isDone: !task.isDone, completedAt: !task.isDone ? nowISOTime() : null }));
    const done = updated.filter((x) => x.isDone).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    const undone = updated.filter((x) => !x.isDone);
    saveState({ tasks: [...undone, ...done] });
  }

  function startEdit(task) {
    if (editId) cancelEdit(); 
    setEditId(task.id);
    setPreEditState({ title: inputTitle, date: selectedDate });
    setInputTitle(task.title);
    setSelectedDate(task.dueDate);
    inputRef.current?.focus();
  }

  function saveEdit() {
    if (!inputTitle.trim()) return flashInputError();
    const updated = tasks.map((task) => (task.id === editId ? { ...task, title: inputTitle.trim(), dueDate: selectedDate } : task));
    saveState({ tasks: updated });
    setEditId(null);
    setInputTitle("");
    setSelectedDate(preEditState.date);
    inputRef.current?.focus();
  }
  
  function cancelEdit() {
    setEditId(null);
    setInputTitle(preEditState.title);
    setSelectedDate(preEditState.date);
  }

  function onTaskRightClick(e, task) {
    e.preventDefault();
    if (task.isDone || pendingDelete === task.id) {
      const updated = tasks.filter((t) => t.id !== task.id);
      saveState({ tasks: updated });
      setPendingDelete(null);
    } else {
      setPendingDelete(task.id);
    }
  }

  // Pin operations
  function addPinFromInput() {
    const text = inputTitle.trim();
    if (!text || pins.includes(text)) return flashInputError();
    saveState({ pins: [text, ...pins] });
  }

  function usePin(text) {
    setInputTitle(text);
    saveState({ pins: [text, ...pins.filter((p) => p !== text)] });
    inputRef.current?.focus();
  }

  function removePin(e, text) {
    e.preventDefault();
    saveState({ pins: pins.filter((p) => p !== text) });
  }

  // Input error visual
  const [inputErr, setInputErr] = useState(false);
  function flashInputError() {
    setInputErr(true);
    setTimeout(() => setInputErr(false), 1000);
  }

  // --- Date selector: weekly view ---
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDates = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const sunday = new Date(base);
    sunday.setDate(base.getDate() - base.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      return { iso, dayName: d.toLocaleDateString("ja-JP", { weekday: "short" }), md: `${d.getMonth() + 1}/${d.getDate()}`, isToday: iso === todayISO(), isSunday: d.getDay() === 0, isSaturday: d.getDay() === 6 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  // Custom date modal
  const [showDateModal, setShowDateModal] = useState(false);
  const [modalDate, setModalDate] = useState({ year: "", month: "", day: "" });

  const isModalDateValid = useMemo(() => {
    const { year, month, day } = modalDate;
    const yearNum = parseInt(year, 10), monthNum = parseInt(month, 10), dayNum = parseInt(day, 10);
    if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum) || year.length !== 4 || month.length === 0 || day.length === 0) return false;
    const date = new Date(yearNum, monthNum - 1, dayNum);
    return date.getFullYear() === yearNum && date.getMonth() === monthNum - 1 && date.getDate() === dayNum;
  }, [modalDate]);

  function openCustomDate() {
    const [year, month, day] = todayISO().split('-');
    setModalDate({ year, month, day });
    setShowDateModal(true);
  }

  function applyCustomDate() {
    if (!isModalDateValid) return;
    const { year, month, day } = modalDate;
    setSelectedDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    setShowDateModal(false);
  }
  
  useLayoutEffect(() => {
    const calculateOverflow = () => {
      const container = pinAreaRef.current;
      if (!container) {
        setOverflowPinIndex(Infinity);
        return;
      }
      
      const items = Array.from(container.children).filter(el => el.classList.contains('pinned-item'));
      if (items.length === 0) {
        setOverflowPinIndex(Infinity);
        return;
      }

      const rowOffsets = [...new Set(items.map(item => (item as HTMLElement).offsetTop))];
      if (rowOffsets.length > 3) {
        const fourthRowOffset = rowOffsets[3];
        const firstOverflowIndex = items.findIndex(item => (item as HTMLElement).offsetTop >= fourthRowOffset);
        setOverflowPinIndex(firstOverflowIndex === -1 ? Infinity : firstOverflowIndex);
      } else {
        setOverflowPinIndex(Infinity);
      }
    };
    
    calculateOverflow();
    const resizeObserver = new ResizeObserver(calculateOverflow);
    if (pinAreaRef.current) {
      resizeObserver.observe(pinAreaRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [pins]);


  const weekDisplayText = useMemo(() => {
    if (weekOffset === 0) return "今週";
    if (weekOffset === 1) return "来週";
    if (weekOffset === -1) return "先週";
    return `${Math.abs(weekOffset)}週${weekOffset > 0 ? "後" : "前"}`;
  }, [weekOffset]);
  
  const otherDateButtonText = useMemo(() => {
    if (!selectedDate || weekDates.some(d => d.iso === selectedDate)) return "その他";
    const [_, month, day] = selectedDate.split('-');
    return `その他 (${parseInt(month, 10)}月${parseInt(day, 10)}日)`;
  }, [selectedDate, weekDates]);

  // UI derived lists
  const undoneTasks = tasks.filter((t) => !t.isDone).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const doneTasks = tasks.filter((t) => t.isDone).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  return (
    <>
      <style>{`
/* --- ベーススタイル --- */
:root { --bg-color: #f5f5f5; --paper-bg-color: #ffffff; --text-color: #222; --subtext-color: #777; --border-color: #eaeaea; --button-bg-color: #e7e7e7; --button-hover-bg-color: #dcdcdc; --primary-color: #3F51B5; }
*, *::before, *::after { box-sizing: border-box; }
body { background: var(--bg-color); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: var(--text-color); margin: 0; padding: 60px 16px; line-height: 1.75; -webkit-font-smoothing: antialiased; }
/* ▼ 修正点: max-widthを900pxに戻して広くします */
.app-container { background: var(--paper-bg-color); padding: 40px 52px; max-width: 900px; margin: auto; border-radius: 16px; border: 1px solid var(--border-color); }
h1, h2 { margin-top: 0; font-weight: 600; line-height: 1.4; }
h1 { font-size: 28px; margin-bottom: 24px; text-align: left; }
h2 { font-size: 18px; color: var(--subtext-color); font-weight: 500; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;}
/* --- 入力エリア --- */
.input-group { display: flex; gap: 0.5rem; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 16px; margin-bottom: 16px; }
#new-todo-title { flex-grow: 1; border: none; background: none; font-size: 18px; padding: 8px 4px; outline: none; line-height: 1.5; color: var(--text-color); }
#new-todo-title::placeholder { color: #bbb; }
#new-todo-title.error { box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.5); border-radius: 4px; }
.action-button { background: transparent; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; transition: background 0.15s ease; color: #555; padding: 0; display: flex; align-items: center; justify-content: center; }
.action-button:hover { background: var(--button-bg-color); }
#add-button { width: 50px; height: 50px; background-color: var(--primary-color); color: white; border-radius: 8px; }
#add-button:hover { background-color: #303F9F; }
/* --- 日付セレクター --- */
.date-selector-wrapper { margin-top: 1.5rem; padding: 0; }
.week-navigator { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.week-nav-button { background: none; border: none; font-size: 1.5rem; color: #999; cursor: pointer; transition: color 0.2s; padding: 0 0.5rem; }
.week-nav-button:hover { color: var(--text-color); }
#week-display { font-weight: 600; color: var(--text-color); }
.date-selector { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; }
.date-button { background: transparent; border: 1px solid transparent; padding: 12px 0; font-size: 14px; border-radius: 8px; cursor: pointer; transition: background 0.15s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.4; color: var(--text-color); }
.date-button:hover { background: var(--button-bg-color); }
.date-button.active { background: var(--primary-color); color: white; font-weight: bold; }
.date-button.today-date { font-weight: bold; font-style: italic; text-decoration: underline; }
.date-button.sunday-date { color: #dc3545; }
.date-button.saturday-date { color: #007bff; }
.day-name { font-weight: 500; font-size: 14px; }
.date-num { font-size: 12px; opacity: 0.8; }
.date-options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.75rem; }
/* --- ピン留めエリア --- */
.pinned-list-area { display: flex; flex-wrap: wrap; gap: 0.75rem; padding: 1.5rem 0; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; }
.pinned-item { display: inline-flex; align-items: center; background-color: var(--button-bg-color); color: var(--text-color); padding: 8px 16px; border-radius: 8px; font-size: 16px; cursor: pointer; transition: background-color 0.2s; max-width: 200px; }
.pinned-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pinned-item:hover { background-color: var(--button-hover-bg-color); }
.pinned-item.hidden-pin { display: none; }
.pin-toggle-button { background: none; border: none; color: var(--primary-color); cursor: pointer; font-size: 14px; font-weight: 500; padding: 8px; margin-top: 8px; width: 100%; text-align: center; order: 99; }
/* --- タスクリスト --- */
.task-section { margin-top: 16px; }
.task-list { list-style: none; padding: 0; margin: 0; }
.task-item { background-color: transparent; padding: 12px 8px; border-radius: 8px; margin-top: 4px; border: 1px solid transparent; cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.task-item:hover { background-color: #f9f9f9; }
.task-main { flex-grow: 1; }
.task-content { font-size: 16px; font-weight: 400; }
.task-item.done { opacity: 0.6; }
.task-item.done .task-content { text-decoration: line-through; }
.task-item.pending-delete { background-color: #fff3cd; color: #664d03; }
.task-item.due-soon { background-color: rgba(255, 243, 205, 0.6); }
.task-item.overdue { background-color: rgba(248, 215, 218, 0.6); }
.task-due-date { font-size: 13px; color: var(--subtext-color); background-color: var(--button-bg-color); padding: 2px 8px; border-radius: 4px; flex-shrink: 0; }
.task-due-date.due-today { background-color: #fff3cd; color: #664d03; font-weight: 500; }
.edit-button { background: none; border: none; font-size: 1rem; cursor: pointer; padding: 4px 8px; border-radius: 4px; opacity: 0; transition: all 0.2s; color: #555; }
.task-item:hover .edit-button { opacity: 1; }
.edit-button:hover { background-color: var(--button-bg-color); }
.empty-message { text-align: center; color: var(--subtext-color); padding: 2rem; }
/* --- 日付入力モーダル --- */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.date-input-modal { background: var(--paper-bg-color); padding: 40px 52px; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.1); min-width: 320px; max-width: 90vw; }
.modal-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; text-align: center; }
.modal-buttons { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
.modal-btn { background: var(--button-bg-color); border: none; padding: 12px 20px; font-size: 15px; border-radius: 8px; cursor: pointer; transition: background 0.15s ease; font-weight: 500; }
.modal-btn:hover { background: var(--button-hover-bg-color); }
.modal-btn-primary { background-color: var(--primary-color); color: white; }
.modal-btn-primary:hover { background-color: #303F9F; }
.modal-btn-primary:disabled { background-color: #b0bec5; cursor: not-allowed; color: #eceff1; }
@media(max-width:640px){ 
  .app-container { padding:28px 20px } 
  #add-button { width: 44px; height: 44px; }
  .action-button { width: 36px; height: 36px; }
}
      `}</style>
      <div className="app-container" role="application">
        <header><h1>Simple Click Todo</h1></header>
        <main>
          <div className="input-group">
            <input id="new-todo-title" ref={inputRef} className={inputErr ? "error" : ""} placeholder="タスクのタイトルを入力..." value={inputTitle} onChange={(e) => setInputTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") editId ? saveEdit() : addTaskFromInput(); else if (e.key === "Escape") cancelEdit(); }} />
            <button className="action-button pin-button" id="pin-button" title="入力内容をピン止め" onClick={addPinFromInput}><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none" /><path d="M16 9V4h1V2H7v2h1v5l-2 2v2h5.2v7h1.6v-7H18v-2l-2-2z" /></svg></button>
            <button className="action-button add-button" id="add-button" title={editId ? "編集を保存" : "タスクを追加"} onClick={() => (editId ? saveEdit() : addTaskFromInput())}>
              {editId ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              )}
            </button>
            {editId && <button className="action-button cancel-button" title="キャンセル" onClick={cancelEdit}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>}
          </div>
          <div className="date-selector-wrapper">
            <div className="week-navigator">
              <button className="week-nav-button" onClick={() => setWeekOffset(weekOffset - 1)}>◀</button>
              <span id="week-display">{weekDisplayText}</span>
              <button className="week-nav-button" onClick={() => setWeekOffset(weekOffset + 1)}>▶</button>
            </div>
            <div className="date-selector">{weekDates.map((d) => <button key={d.iso} className={`date-button ${selectedDate === d.iso ? "active" : ""} ${d.isToday ? "today-date" : ""} ${d.isSunday ? "sunday-date" : ""} ${d.isSaturday ? "saturday-date" : ""}`} onClick={() => setSelectedDate(d.iso)}><span className="day-name">{d.dayName}</span><span className="date-num">({d.md})</span></button>)}</div>
            <div className="date-options">
              <button className={`date-button ${!weekDates.some(d => d.iso === selectedDate) && selectedDate !== null ? "active" : ""}`} onClick={openCustomDate}><svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor" style={{ verticalAlign: "middle", marginRight: "4px" }}><path d="M0 0h24v24H0z" fill="none" /><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V9h14v10zm0-12H5V5h14v2z" /></svg>{otherDateButtonText}</button>
              <button className={`date-button ${selectedDate === null ? "active" : ""}`} onClick={() => setSelectedDate(null)}>日付なし</button>
            </div>
          </div>
          <section ref={pinAreaRef} className="pinned-list-area">
            {pins.map((p, index) => (
              <div 
                key={p} 
                className={`pinned-item ${!showPinsAll && index >= overflowPinIndex ? "hidden-pin" : ""}`}
                onClick={() => usePin(p)} 
                onContextMenu={(e) => removePin(e, p)} 
                title={p}
              >
                <span>{p}</span>
              </div>
            ))}
            {overflowPinIndex < pins.length && (
              <button className="pin-toggle-button" onClick={() => setShowPinsAll(!showPinsAll)}>
                {showPinsAll ? "▲ 閉じる" : `▼ もっと見る (${pins.length - overflowPinIndex})`}
              </button>
            )}
          </section>
          <section className="task-display-area">
            <div className="task-section">
              <h2>未完了</h2>
              <ul className="task-list">
                {undoneTasks.map((t) => {
                  const today = todayISO(), tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                  const isOverdue = t.dueDate && t.dueDate < today, isDueSoon = t.dueDate && (t.dueDate === today || t.dueDate === tomorrow.toISOString().slice(0, 10));
                  const cls = `task-item ${isOverdue ? "overdue" : ""} ${isDueSoon ? "due-soon" : ""} ${pendingDelete === t.id ? "pending-delete" : ""}`;
                  return (<li key={t.id} className={cls} onClick={() => { if (pendingDelete !== t.id) toggleDone(t); else setPendingDelete(null); }} onContextMenu={(e) => onTaskRightClick(e, t)} data-pending-id={pendingDelete === t.id ? t.id : undefined}><div className="task-main"><span className="task-content">{pendingDelete === t.id ? "右クリックで削除 / 左クリックでキャンセル" : t.title}</span></div>{t.dueDate && <time className={`task-due-date ${t.dueDate === today ? "due-today" : ""}`}>{t.dueDate === today ? "今日まで" : t.dueDate}</time>}<button className="edit-button" title="編集" onClick={(e) => { e.stopPropagation(); startEdit(t); }}><svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none" /><path d="M3 17.25V21h3.75L18 9.75 14.25 6 3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg></button></li>);
                })}
                {undoneTasks.length === 0 && <li className="empty-message">未完了のタスクはありません</li>}
              </ul>
            </div>
            <div className="task-section">
              <h2>完了済み</h2>
              <ul className="task-list">
                {doneTasks.map((t) => (<li key={t.id} className="task-item done" onClick={() => toggleDone(t)} onContextMenu={(e) => onTaskRightClick(e, t)}><div className="task-main"><span className="task-content">{t.title}</span></div>{t.dueDate && <time className="task-due-date">{t.dueDate}</time>}</li>))}
                {doneTasks.length === 0 && <li className="empty-message">完了したタスクはありません</li>}
              </ul>
            </div>
          </section>
        </main>
      </div>
      {showDateModal && (
        <div className="modal-overlay" onClick={() => setShowDateModal(false)}>
          <div className="date-input-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor">
                 <path d="M0 0h24v24H0z" fill="none" />
                 <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V9h14v10zm0-12H5V5h14v2z" />
              </svg>
              <span>日付を入力</span>
            </h3>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: 14, color: 'var(--subtext-color)' }}>年・月・日をそれぞれ入力してください</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <input type="text" placeholder="yyyy" maxLength={4} value={modalDate.year} onChange={(e) => setModalDate(p => ({ ...p, year: e.target.value.replace(/[^0-9]/g, '') }))} style={{ width: 80, padding: 10, fontSize: 16, border: '1px solid #ccc', borderRadius: 8, textAlign: 'center' }} />
              <span style={{ fontSize: '1rem', color: 'var(--subtext-color)' }}>年</span>
              <input type="text" placeholder="mm" maxLength={2} value={modalDate.month} onChange={(e) => setModalDate(p => ({ ...p, month: e.target.value.replace(/[^0-9]/g, '') }))} style={{ width: 60, padding: 10, fontSize: 16, border: '1px solid #ccc', borderRadius: 8, textAlign: 'center' }} />
              <span style={{ fontSize: '1rem', color: 'var(--subtext-color)' }}>月</span>
              <input type="text" placeholder="dd" maxLength={2} value={modalDate.day} onChange={(e) => setModalDate(p => ({ ...p, day: e.target.value.replace(/[^0-9]/g, '') }))} style={{ width: 60, padding: 10, fontSize: 16, border: '1px solid #ccc', borderRadius: 8, textAlign: 'center' }} />
              <span style={{ fontSize: '1rem', color: 'var(--subtext-color)' }}>日</span>
            </div>
            <div className="modal-buttons">
              <button className="modal-btn" onClick={() => setShowDateModal(false)}>キャンセル</button>
              <button className="modal-btn modal-btn-primary" onClick={applyCustomDate} disabled={!isModalDateValid}>設定</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}