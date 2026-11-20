export const lessons = [
  {
    id: "parameter",
    icon: "&",
    tab: "函数里的数组",
    topic: "sizeof(arr)",
    title: "数组传进函数，大小怎么变了？",
    prompt: "同一个名字 arr，在 main 和 inspect 中分别是什么类型？预测三行输出。",
    explanation: [
      "main 中的 arr 是一个真实数组。sizeof(arr) 计算整个数组的字节数，等于元素个数乘以 sizeof(int)。",
      "形参写成 int arr[] 时，声明会调整为 int *arr。调用 inspect(arr) 时，实参的数组表达式转换成指向首元素的指针。函数得到的是首地址，sizeof(arr) 因此给出指针的大小。",
      "arr[0] 的类型仍是 int，所以 sizeof(arr[0]) 在本练习的两种环境下都等于 4。函数要知道数组长度时，可以用另一个参数显式传入长度。",
    ],
  },
  {
    id: "element",
    icon: "B",
    tab: "一个元素多大",
    topic: "sizeof(arr[0])",
    title: "sizeof(arr[0]) 取决于什么？",
    prompt: "分别预测首元素的字节数、首元素的值和数组长度。试试更换元素类型。",
    explanation: [
      "arr[0] 是一个元素表达式。对本题的普通整数类型，sizeof(arr[0]) 根据表达式的类型得出字节数，表达式本身不求值。",
      "第二个 printf 读取并打印 arr[0] 存储的数值。调整数值会改变这一行输出，调整类型则会改变元素的字节数和地址间距。",
      "在数组定义所在的作用域，sizeof(arr) / sizeof(arr[0]) 等于元素个数。如果 arr 是指针，这个式子无法得出数组长度。",
    ],
  },
  {
    id: "loop",
    icon: "↻",
    tab: "循环打印几次",
    topic: "for + printf",
    title: "这段 for 循环会打印几次？",
    prompt: "沿着初始化、条件检查、打印和递增追踪 i，并预测输出和打印次数。",
    explanation: [
      "初始化只做一次。每次条件成立，循环体中的 printf 执行一次，然后更新 i，再回来判断。",
      "默认参数下，i = 0、1、2、3、4 时各打印一次。i = 5 仍检查一次条件，但 5 < 5 为假，因此共打印 5 次。",
      "如果条件成立时 i 已超出数组下标范围，读取 arr[i] 会触发未定义行为。遇到这一步，模拟器会停止并标出越界下标。",
    ],
  },
  {
    id: "pointer",
    icon: "*",
    tab: "移动与解引用",
    topic: "p += k / *p",
    title: "通过指针赋值，数组里发生了什么？",
    prompt: "预测移动 p、执行 *p 赋值后，两条 printf 分别会打印什么。",
    explanation: [
      "int *p = arr 让 p 保存 arr[0] 的地址。p += k 跨过 k 个 int，地址增加 k × sizeof(int) 字节。",
      "*p 表示 p 当前指向的元素。*p = value 将 value 写入该元素。赋值后，指针存放的地址保持原样。",
      "这时 *p 和 arr[k] 访问同一个元素，所以两条 printf 会打印相同的值。",
    ],
  },
];

const initialValues = [10, 20, 30, 40, 50, 60];

export function defaults(id) {
  return {
    values: [...initialValues],
    length: id === "loop" ? 5 : 3,
    pointerBytes: 8,
    elementType: "int",
    start: 0,
    bound: 5,
    comparison: "<",
    increment: 1,
    offset: 1,
    replacement: 99,
  };
}

const elementSizes = { int: 4, short: 2, "signed char": 1 };

export function simulate(id, settings) {
  const { length, pointerBytes, elementType, start, bound, comparison, increment, offset, replacement } = settings;
  const type = id === "element" ? elementType : "int";
  const stride = elementSizes[type];
  const initial = settings.values.slice(0, length);
  const declaration = "    " + type + " arr[" + length + "] = {" + initial.join(", ") + "};";
  let state = { scope: "尚未运行", values: null, pointer: null, target: null, index: null, active: null, action: null };
  let output = [];
  let error = null;
  const frames = [];
  let code;

  function step(line, note, change = {}) {
    state = { ...state, active: null, action: null, ...change };
    frames.push({ ...state, line, note, output: [...output], error });
  }

  function print(line, value, note, change) {
    output.push(String(value));
    step(line, note, change);
  }

  step(null, "可以先预测输出，再从数组初始化开始单步执行。");

  if (id === "parameter") {
    code = [
      "#include <stdio.h>",
      "",
      "void inspect(int arr[]) {",
      '    printf("%zu\\n", sizeof(arr));',
      '    printf("%zu\\n", sizeof(arr[0]));',
      "}",
      "",
      "int main(void) {",
      declaration,
      '    printf("%zu\\n", sizeof(arr));',
      "    inspect(arr);",
      "    return 0;",
      "}",
    ];
    step(9, "main 创建含 " + length + " 个 int 的数组，元素连续存放。", { scope: "main()", values: initial });
    print(10, length * stride, "这里的 arr 是整个数组，占 " + length + " × " + stride + " 字节。", { action: "array" });
    step(11, "调用时，实参 arr 转换为指向首元素的指针，传入 inspect。");
    step(3, "形参 int arr[] 被调整为 int *arr，指向 main 中的 arr[0]。", { scope: "inspect()", pointer: "arr", target: 0 });
    print(4, pointerBytes, "inspect 中的 arr 是指针，本环境的 int * 占 " + pointerBytes + " 字节。");
    print(5, stride, "arr[0] 的类型是 int。sizeof 只根据类型计算字节数，无需求值。", { active: 0, action: "type" });
    step(6, "inspect 返回，形参离开作用域，原数组仍属于 main。", { pointer: null, target: null, scope: "main()" });
    step(12, "main 返回，程序结束。下方保留输出，内存视图保留结束前的数组。", { scope: "main() 返回前" });
  } else if (id === "element") {
    code = [
      "#include <stdio.h>",
      "",
      "int main(void) {",
      declaration,
      '    printf("%zu\\n", sizeof(arr[0]));',
      '    printf("%d\\n", arr[0]);',
      '    printf("%zu\\n", sizeof(arr) / sizeof(arr[0]));',
      "    return 0;",
      "}",
    ];
    step(4, "创建 " + type + " 数组。相邻的两个元素地址相差 " + stride + " 字节。", { scope: "main()", values: initial });
    print(5, stride, "sizeof 只根据 arr[0] 的类型 " + type + " 算出 " + stride + " 字节。", { active: 0, action: "type" });
    print(6, initial[0], "这次会读取并打印 arr[0] 存储的值。", { active: 0, action: "read" });
    print(7, length, "数组总字节数 " + (length * stride) + " 除以元素字节数 " + stride + "，得到 " + length + " 个元素。", { action: "array" });
    step(8, "main 返回，程序结束。", { scope: "main() 返回前" });
  } else if (id === "loop") {
    code = [
      "#include <stdio.h>",
      "",
      "int main(void) {",
      declaration,
      "    for (int i = " + start + "; i " + comparison + " " + bound + "; i += " + increment + ") {",
      '        printf("%d\\n", arr[i]);',
      "    }",
      "    return 0;",
      "}",
    ];
    step(4, "main 初始化数组。下标范围是 0 到 " + (length - 1) + "。", { scope: "main()", values: initial });
    step(5, "初始化 i = " + start + "。这部分只执行一次。", { index: start });
    for (let i = start; ; i += increment) {
      const condition = comparison === "<" ? i < bound : i <= bound;
      const expression = i + " " + comparison + " " + bound;
      step(5, condition ? expression + " 成立，进入循环体。" : expression + " 不成立，退出循环。");
      if (!condition) break;
      if (i >= length) {
        error = "arr[" + i + "] 越界（有效下标 0 到 " + (length - 1) + "）。C 程序行为未定义，模拟在此停止。";
        step(6, "本轮试图读取越界元素。");
        break;
      }
      print(6, initial[i], "读取 arr[" + i + "]，执行第 " + (output.length + 1) + " 次 printf。", { active: i, action: "read" });
      step(5, "执行 i += " + increment + "，i 从 " + i + " 变为 " + (i + increment) + "。", { index: i + increment });
    }
    if (!error) step(8, "main 返回。本次一共执行 " + output.length + " 次 printf。", { index: null, scope: "main() 返回前" });
  } else {
    code = [
      "#include <stdio.h>",
      "",
      "int main(void) {",
      declaration,
      "    int *p = arr;",
      "    p += " + offset + ";",
      "    *p = " + replacement + ";",
      '    printf("%d\\n", *p);',
      '    printf("%d\\n", arr[' + offset + "]);",
      "    return 0;",
      "}",
    ];
    step(4, "main 创建数组，随后会把首元素地址交给 p。", { scope: "main()", values: initial });
    step(5, "p 现在存放 arr[0] 的首地址。", { pointer: "p", target: 0 });
    step(6, "p 移到 arr[" + offset + "]，地址增加 " + offset + " × " + stride + " 字节。", { target: offset });
    const updated = [...initial];
    updated[offset] = replacement;
    step(7, "向 p 指向的 arr[" + offset + "] 写入 " + replacement + "。p 存放的地址保持原样。", { values: updated, active: offset, action: "write" });
    print(8, replacement, "读取 p 指向的元素，打印 " + replacement + "。", { active: offset, action: "read" });
    print(9, replacement, "用下标读取同一个元素，打印的值相同。", { active: offset, action: "read" });
    step(10, "main 返回，程序结束。内存视图保留返回前的状态。", { scope: "main() 返回前" });
  }

  return { code, frames, type, stride };
}

export function comparePrediction(raw, count, frame, requireCount) {
  if (frame.error) return { status: "warn", message: "本组参数触发越界。请调整循环边界、起点或数组长度后再核对。" };
  const expected = raw.trim() ? raw.trim().split(/\r?\n/).map(line => line.trim()) : [];
  if (requireCount && (!/^\d+$/.test(count.trim()) || Number(count) > 6)) {
    return { status: "warn", message: "请填写预计打印次数（0 到 6 的整数）。" };
  }
  const { output } = frame;
  const firstDifference = output.findIndex((value, i) => value !== expected[i]);
  if (firstDifference >= 0 && firstDifference < expected.length) {
    return { status: "warn", message: "第 " + (firstDifference + 1) + " 行与实际输出不同。可以回到对应的 printf 再看一次。" };
  }
  if (expected.length !== output.length) {
    return { status: "warn", message: "你预测了 " + expected.length + " 行，实际输出 " + output.length + " 行。" };
  }
  if (requireCount && Number(count) !== output.length) {
    return { status: "warn", message: "输出内容正确。这段代码的 printf 实际执行了 " + output.length + " 次。" };
  }
  return { status: "success", message: "预测正确！" + (requireCount ? " 本次打印 " + output.length + " 次。" : " 每一行都与实际输出一致。") };
}
