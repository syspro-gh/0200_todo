"use strict";

const STORAGE_KEY = "todo-app.todos";
const PRIORITY_LABELS = { high: "優先度：高", normal: "優先度：中", low: "優先度：低" };

const $ = (sel) => document.querySelector(sel);
const listEl = $("#todo-list");
const emptyEl = $("#empty");
const summaryEl = $("#summary");
const template = $("#todo-template");

let todos = load();
let filter = "all";
let query = "";
let draggingId = null;

// ---------- 保存 ----------
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 保存できない環境（プライベートモード等）でも画面上は動かす
  }
}

function update(fn) {
  fn();
  save();
  render();
}

// ---------- 日付 ----------
function dateKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function describeDue(due) {
  if (!due) return null;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const [, m, d] = due.split("-").map(Number);
  const label = `${m}/${d}`;
  if (due < dateKey(today)) return { text: `期限切れ（${label}）`, cls: "overdue" };
  if (due === dateKey(today)) return { text: "今日まで", cls: "today" };
  if (due === dateKey(tomorrow)) return { text: "明日まで", cls: "" };
  return { text: `${label} まで`, cls: "" };
}

// ---------- 描画 ----------
function visibleTodos() {
  const q = query.trim().toLowerCase();
  return todos.filter((t) => {
    if (filter === "active" && t.done) return false;
    if (filter === "done" && !t.done) return false;
    return !q || t.title.toLowerCase().includes(q);
  });
}

function render() {
  const items = visibleTodos();
  const canDrag = filter === "all" && !query.trim();
  listEl.replaceChildren(...items.map((t) => renderItem(t, canDrag)));
  listEl.classList.toggle("no-drag", !canDrag);

  const remaining = todos.filter((t) => !t.done).length;
  summaryEl.textContent = todos.length
    ? `残り ${remaining} 件 / 全 ${todos.length} 件`
    : "";

  emptyEl.hidden = items.length > 0;
  if (!items.length) {
    emptyEl.textContent = todos.length
      ? "該当するタスクはありません"
      : "タスクはまだありません。上の入力欄から追加しましょう。";
  }
  $("#clear-done").hidden = !todos.some((t) => t.done);
}

function renderItem(todo, canDrag) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = todo.id;
  li.classList.add(`priority-${todo.priority}`);
  li.classList.toggle("done", todo.done);
  li.draggable = canDrag;

  li.querySelector(".toggle").checked = todo.done;
  li.querySelector(".title").textContent = todo.title;
  li.querySelector(".priority").textContent = PRIORITY_LABELS[todo.priority];

  const dueEl = li.querySelector(".due");
  const due = describeDue(todo.due);
  if (due) {
    dueEl.textContent = due.text;
    if (due.cls) dueEl.classList.add(due.cls);
  } else {
    dueEl.remove();
  }
  return li;
}

function findTodo(el) {
  const li = el.closest(".todo");
  return li && todos.find((t) => t.id === li.dataset.id);
}

// ---------- 追加 ----------
$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const titleInput = $("#add-title");
  const title = titleInput.value.trim();
  if (!title) return;
  update(() => {
    todos.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      title,
      done: false,
      priority: $("#add-priority").value,
      due: $("#add-due").value,
      createdAt: Date.now(),
    });
  });
  titleInput.value = "";
  $("#add-due").value = "";
  $("#add-priority").value = "normal";
  titleInput.focus();
});

// ---------- 完了・削除 ----------
listEl.addEventListener("change", (e) => {
  if (!e.target.matches(".toggle")) return;
  const todo = findTodo(e.target);
  if (todo) update(() => { todo.done = e.target.checked; });
});

listEl.addEventListener("click", (e) => {
  if (!e.target.matches(".delete")) return;
  const todo = findTodo(e.target);
  if (todo) update(() => { todos = todos.filter((t) => t !== todo); });
});

$("#clear-done").addEventListener("click", () => {
  const count = todos.filter((t) => t.done).length;
  if (count && confirm(`完了したタスク ${count} 件を削除しますか？`)) {
    update(() => { todos = todos.filter((t) => !t.done); });
  }
});

// ---------- 編集（ダブルクリック） ----------
listEl.addEventListener("dblclick", (e) => {
  const titleEl = e.target.closest(".title");
  if (!titleEl) return;
  const todo = findTodo(titleEl);
  if (!todo) return;

  const input = document.createElement("input");
  input.className = "edit-input";
  input.value = todo.title;
  input.maxLength = 200;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const title = input.value.trim();
    if (!commit) return render();
    update(() => {
      if (title) todo.title = title;
      else todos = todos.filter((t) => t !== todo);
    });
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.isComposing) finish(true);
    if (ev.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
});

// ---------- 絞り込み・検索 ----------
document.querySelectorAll(".filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    document.querySelectorAll(".filter").forEach((b) => b.classList.toggle("is-active", b === btn));
    render();
  });
});

$("#search").addEventListener("input", (e) => {
  query = e.target.value;
  render();
});

// ---------- ドラッグで並べ替え ----------
listEl.addEventListener("dragstart", (e) => {
  const li = e.target.closest(".todo");
  if (!li) return;
  draggingId = li.dataset.id;
  li.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggingId);
});

listEl.addEventListener("dragover", (e) => {
  if (!draggingId) return;
  e.preventDefault();
  listEl.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  const li = e.target.closest(".todo");
  if (li && li.dataset.id !== draggingId) li.classList.add("drop-target");
});

listEl.addEventListener("drop", (e) => {
  e.preventDefault();
  const li = e.target.closest(".todo");
  if (!draggingId || !li || li.dataset.id === draggingId) return;
  update(() => {
    const from = todos.findIndex((t) => t.id === draggingId);
    const [moved] = todos.splice(from, 1);
    const to = todos.findIndex((t) => t.id === li.dataset.id);
    // 下へ動かすときは対象の後ろ、上へ動かすときは前に入れる
    todos.splice(from <= to ? to + 1 : to, 0, moved);
  });
});

listEl.addEventListener("dragend", () => {
  draggingId = null;
  render();
});

// 別タブで変更されたら反映する
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    todos = load();
    render();
  }
});

render();
