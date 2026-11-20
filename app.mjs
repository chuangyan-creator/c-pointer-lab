import { lessons, defaults, simulate, comparePrediction } from "./engine.mjs";

const byId = id => document.getElementById(id);
const ui = Object.fromEntries([
  "lesson-tabs", "progress-text", "progress-track", "workspace", "exercise-title", "exercise-prompt", "environment",
  "code-lines", "step-label", "step-note", "next-step", "previous-step", "run-all", "reset-run", "memory-cells",
  "memory-scope", "memory-relation", "config", "config-error", "defaults", "prediction", "count-label",
  "prediction-count", "check", "feedback", "output", "output-count", "output-empty", "program-error",
  "explanation", "explanation-body",
].map(id => [id, byId(id)]));

const progressKey = "c-pointer-lab-completed";
let completed = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(progressKey) ?? "[]");
  if (Array.isArray(saved)) completed = new Set(lessons.filter(lesson => saved.includes(lesson.id)).map(lesson => lesson.id));
} catch {
  // The exercises work without local storage.
}

const sessions = Object.fromEntries(lessons.map(({ id }) => [id, {
  settings: defaults(id), prediction: "", count: "", frame: 0, feedback: null,
}]));

let selected = lessons[0];
let lessonState = sessions[selected.id];
let simulation;
let invalid = false;
let fields = {};
let valueFields = [];
let codeRows = [];
const tabs = new Map();

function node(tag, className, content) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (content !== undefined) item.textContent = content;
  return item;
}

for (const lesson of lessons) {
  const tab = node("button", "lesson-tab");
  tab.type = "button";
  tab.id = "tab-" + lesson.id;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "workspace");
  const icon = node("span", "topic-icon", lesson.icon);
  icon.setAttribute("aria-hidden", "true");
  const label = node("span", "tab-label");
  label.append(node("strong", "", lesson.tab), node("code", "", lesson.topic));
  const done = node("span", "tab-done", "✓");
  done.setAttribute("aria-label", "已答对");
  tab.append(icon, label, done);
  tabs.set(lesson.id, tab);
  ui["lesson-tabs"].append(tab);
  tab.addEventListener("click", () => selectLesson(lesson));
  tab.addEventListener("keydown", event => {
    let index = lessons.indexOf(lesson);
    switch (event.key) {
      case "ArrowLeft": index -= 1; break;
      case "ArrowRight": index += 1; break;
      case "Home": index = 0; break;
      case "End": index = lessons.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const next = lessons[(index + lessons.length) % lessons.length];
    selectLesson(next);
    tabs.get(next.id).focus();
  });
}

function updateProgress() {
  ui["progress-text"].textContent = completed.size + " / " + lessons.length;
  ui["progress-track"].setAttribute("aria-valuenow", completed.size);
  [...ui["progress-track"].children].forEach((segment, i) => segment.classList.toggle("filled", i < completed.size));
  for (const [id, tab] of tabs) tab.querySelector(".tab-done").hidden = !completed.has(id);
}

function selectLesson(lesson) {
  selected = lesson;
  lessonState = sessions[lesson.id];
  for (const [id, tab] of tabs) {
    const active = id === lesson.id;
    tab.setAttribute("aria-selected", active);
    tab.tabIndex = active ? 0 : -1;
  }
  ui.workspace.setAttribute("aria-labelledby", "tab-" + lesson.id);
  ui["exercise-title"].textContent = lesson.title;
  ui["exercise-prompt"].textContent = lesson.prompt;
  ui.prediction.value = lessonState.prediction;
  ui["prediction-count"].value = lessonState.count;
  ui["count-label"].hidden = lesson.id !== "loop";
  ui.explanation.open = false;
  ui["explanation-body"].replaceChildren(...lesson.explanation.map(text => node("p", "", text)));
  buildConfig();
  rebuildTrace();
}

function makeSelect(options, current) {
  const select = node("select");
  select.replaceChildren(...options.map(([value, label]) => new Option(label, String(value))));
  select.value = String(current);
  return select;
}

function numberInput(value, min, max) {
  const input = node("input");
  input.type = "number";
  input.min = min;
  input.max = max;
  input.step = 1;
  input.inputMode = "numeric";
  input.required = true;
  input.value = value;
  return input;
}

function labeled(text, input, className = "field") {
  const label = node("label", className);
  label.append(node("span", "", text), input);
  return label;
}

function offsets(size) {
  return Array.from({ length: size }, (_, index) => [index, index]);
}

function buildConfig() {
  const { settings: s } = lessonState;
  fields = { length: makeSelect(Array.from({ length: 6 }, (_, i) => [i + 1, i + 1]), s.length) };
  const controls = node("div", "parameter-grid");
  controls.append(labeled("数组长度", fields.length));
  if (selected.id === "parameter") {
    fields.pointerBytes = makeSelect([[8, "64 位示例"], [4, "32 位示例"]], s.pointerBytes);
    controls.append(labeled("运行环境", fields.pointerBytes));
  } else if (selected.id === "element") {
    fields.elementType = makeSelect([["int", "int"], ["short", "short"], ["signed char", "signed char"]], s.elementType);
    controls.append(labeled("元素类型", fields.elementType));
  } else if (selected.id === "loop") {
    fields.start = numberInput(s.start, 0, 9);
    fields.comparison = makeSelect([["<", "<"], ["<=", "<="]], s.comparison);
    fields.bound = numberInput(s.bound, 0, 9);
    fields.increment = makeSelect([[1, 1], [2, 2], [3, 3]], s.increment);
    controls.append(
      labeled("起始 i", fields.start), labeled("条件", fields.comparison),
      labeled("边界值", fields.bound), labeled("每次增量", fields.increment),
    );
  } else {
    fields.offset = makeSelect(offsets(s.length), s.offset);
    fields.replacement = numberInput(s.replacement, -99, 99);
    controls.append(labeled("偏移量", fields.offset), labeled("写入值", fields.replacement));
  }
  const array = node("div", "array-parameters");
  const arrayTitle = node("p", "field-title", "数组初值");
  arrayTitle.id = "array-input-title";
  const arrayFields = node("div", "array-fields");
  arrayFields.id = "array-fields";
  arrayFields.setAttribute("role", "group");
  arrayFields.setAttribute("aria-labelledby", arrayTitle.id);
  array.append(arrayTitle, arrayFields);
  ui.config.replaceChildren(controls, array);
  valueFields = [];
  resizeArrayFields(s.length);
  setValidation("");
}

function resizeArrayFields(length) {
  const container = byId("array-fields");
  while (valueFields.length > length) {
    valueFields.pop();
    container.lastElementChild.remove();
  }
  while (valueFields.length < length) {
    const index = valueFields.length;
    const input = numberInput(lessonState.settings.values[index], -99, 99);
    valueFields.push(input);
    container.append(labeled("arr[" + index + "]", input));
  }
}

function setValidation(message) {
  invalid = Boolean(message);
  ui["config-error"].hidden = !invalid;
  ui["config-error"].textContent = message;
}

function updateSettings(event) {
  const length = Number(fields.length.value);
  if (event.target === fields.length) {
    resizeArrayFields(length);
    if (fields.offset) {
      const chosen = Math.min(Number(fields.offset.value), length - 1);
      fields.offset.replaceChildren(...offsets(length).map(([value, label]) => new Option(label, String(value))));
      fields.offset.value = String(chosen);
    }
  }

  const numericFields = [...valueFields, ...Object.values(fields).filter(field => field.type === "number")];
  for (const field of numericFields) field.setAttribute("aria-invalid", String(!field.validity.valid));
  const bad = numericFields.find(field => !field.validity.valid);
  if (bad) {
    const label = bad.closest("label").firstElementChild.textContent;
    setValidation(label + " 请输入 " + bad.min + " 到 " + bad.max + " 之间的整数。");
    lessonState.feedback = null;
    renderFrame();
    return;
  }

  setValidation("");
  for (const [key, field] of Object.entries(fields)) {
    lessonState.settings[key] = key === "comparison" || key === "elementType" ? field.value : Number(field.value);
  }
  valueFields.forEach((field, index) => { lessonState.settings.values[index] = field.valueAsNumber; });
  lessonState.frame = 0;
  lessonState.feedback = null;
  rebuildTrace();
}

function colorCode(line) {
  const part = document.createDocumentFragment();
  const pattern = /"[^"]*"|#[a-z]+|<stdio\.h>|\b(?:int|short|signed|char|void|return|for)\b|\b(?:main|inspect|sizeof|printf)\b|\b\d+\b/g;
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    const token = match[0];
    part.append(line.slice(cursor, match.index));
    const style = /^"/.test(token) ? "syntax-string"
      : /^[#<]/.test(token) ? "syntax-directive"
      : /^\d/.test(token) ? "syntax-number"
      : /^(main|inspect|sizeof|printf)$/.test(token) ? "syntax-function" : "syntax-keyword";
    part.append(node("span", style, token));
    cursor = match.index + token.length;
  }
  part.append(line.slice(cursor));
  return part;
}

function rebuildTrace() {
  simulation = simulate(selected.id, lessonState.settings);
  const { pointerBytes } = lessonState.settings;
  const typeDescription = " · " + simulation.type + " " + simulation.stride + " B";
  ui.environment.replaceChildren(node("span", "environment-dot"), node("span", "", (pointerBytes * 8) + " 位示例" + typeDescription));
  codeRows = simulation.code.map((line, index) => {
    const row = node("li", "code-line");
    const number = node("span", "line-number", index + 1);
    number.setAttribute("aria-hidden", "true");
    const source = node("code", "source-line");
    source.append(colorCode(line));
    row.append(number, source);
    return row;
  });
  ui["code-lines"].replaceChildren(...codeRows);
  renderFrame();
}

const addressOf = i => "0x" + (0x1000 + i * simulation.stride).toString(16).toUpperCase();
const actionLabels = { read: "读取", write: "写入", type: "取类型" };

function renderMemory(frame) {
  const { length } = lessonState.settings;
  ui["memory-scope"].textContent = frame.scope;
  ui["memory-cells"].style.setProperty("--cells", length);
  const cells = Array.from({ length }, (_, i) => {
    const cell = node("div", "memory-cell");
    if (frame.target === i) cell.classList.add("pointed");
    if (frame.active === i) cell.classList.add("active-cell", "action-" + frame.action);
    if (frame.action === "array") cell.classList.add("array-cell");
    cell.append(node("span", "cell-name", "arr[" + i + "]"));
    cell.append(node("strong", "cell-value", frame.values ? frame.values[i] : "—"));
    cell.append(node("span", "cell-address", addressOf(i)));
    const marker = [frame.target === i ? "↑ " + frame.pointer : "", frame.active === i ? actionLabels[frame.action] : ""].filter(Boolean).join(" · ");
    if (marker) cell.append(node("span", "cell-marker", marker));
    return cell;
  });
  ui["memory-cells"].replaceChildren(...cells);

  const relation = ui["memory-relation"];
  relation.replaceChildren();
  if (frame.pointer) {
    const name = selected.id === "parameter" ? "int *arr" : "int *p";
    relation.append(node("code", "relation-key", name + " = " + addressOf(frame.target)));
    relation.append(node("span", "", "指向 arr[" + frame.target + "]" + (selected.id === "parameter" ? "（main 中）" : "")));
  } else if (frame.index !== null) {
    relation.append(node("code", "relation-key", "i = " + frame.index));
    relation.append(node("span", "", frame.index >= length ? "超出下标范围" : "当前下标"));
  } else {
    const description = frame.values ? "相邻地址相差 " + simulation.stride + " 字节" : "单步执行后查看数组分配";
    relation.append(node("span", "", description));
  }
}

function renderFeedback() {
  const feedback = lessonState.feedback;
  ui.feedback.hidden = !feedback;
  ui.feedback.className = "feedback" + (feedback ? " " + feedback.status : "");
  ui.feedback.textContent = feedback?.message ?? "";
}

function renderFrame() {
  const frameIndex = lessonState.frame;
  const frame = simulation.frames[frameIndex];
  const last = simulation.frames.length - 1;
  const done = frameIndex === last;
  ui["step-label"].textContent = frameIndex === 0 ? "待运行" : (done ? (frame.error ? "已停止 · " : "已结束 · ") : "步骤 ") + frameIndex + " / " + last;
  ui["step-note"].textContent = frame.note;
  ui["next-step"].disabled = invalid || done;
  ui["previous-step"].disabled = invalid || frameIndex === 0;
  ui["run-all"].disabled = invalid || done;
  ui["reset-run"].disabled = invalid || frameIndex === 0;
  ui.check.disabled = invalid;

  codeRows.forEach((row, index) => {
    const active = index + 1 === frame.line;
    row.classList.toggle("current-line", active);
    if (active) row.setAttribute("aria-current", "step");
    else row.removeAttribute("aria-current");
  });
  renderMemory(frame);
  ui.output.textContent = frame.output.join("\n");
  ui["output-count"].textContent = frame.output.length + " 次 printf";
  ui["output-empty"].hidden = Boolean(frame.output.length) || Boolean(frame.error);
  ui["output-empty"].textContent = frameIndex === 0 ? "等待运行…" : done ? "运行结束，无输出。" : "尚未执行 printf。";
  ui["program-error"].hidden = !frame.error;
  ui["program-error"].textContent = frame.error ?? "";
  renderFeedback();
}

function setFrame(index) {
  if (invalid) return;
  lessonState.frame = index;
  renderFrame();
}

ui.config.addEventListener("input", updateSettings);
ui.defaults.addEventListener("click", () => {
  lessonState.settings = defaults(selected.id);
  lessonState.frame = 0;
  lessonState.feedback = null;
  buildConfig();
  rebuildTrace();
});

ui["next-step"].addEventListener("click", () => setFrame(lessonState.frame + 1));
ui["previous-step"].addEventListener("click", () => setFrame(lessonState.frame - 1));
ui["run-all"].addEventListener("click", () => setFrame(simulation.frames.length - 1));
ui["reset-run"].addEventListener("click", () => {
  lessonState.feedback = null;
  setFrame(0);
});
ui.prediction.addEventListener("input", () => {
  lessonState.prediction = ui.prediction.value;
  lessonState.feedback = null;
  renderFeedback();
});
ui["prediction-count"].addEventListener("input", () => {
  lessonState.count = ui["prediction-count"].value;
  lessonState.feedback = null;
  renderFeedback();
});
ui.check.addEventListener("click", () => {
  const last = simulation.frames.length - 1;
  lessonState.feedback = comparePrediction(lessonState.prediction, lessonState.count, simulation.frames[last], selected.id === "loop");
  if (lessonState.feedback.status === "success") {
    completed.add(selected.id);
    try {
      localStorage.setItem(progressKey, JSON.stringify([...completed]));
    } catch {
      // In this session the current progress can still be shown.
    }
    updateProgress();
  }
  setFrame(last);
});

updateProgress();
selectLesson(selected);
