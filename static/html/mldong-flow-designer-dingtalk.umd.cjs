(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory(require("vue")) : typeof define === "function" && define.amd ? define(["vue"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, global.MldongFlowDesignerDingtalk = factory(global.vue));
})(this, function(vue) {
  "use strict";
  const MldongFlowDesignerProps = {
    value: {
      type: Object,
      default() {
        return {};
      }
    },
    theme: {
      // 高亮主题配置
      type: Object,
      default() {
        return {};
      }
    },
    highLight: {
      // 高亮数据
      type: Object,
      default() {
        return {};
      }
    },
    initDndPanel: {
      // 是否初始化拖拽面板
      type: Boolean,
      default: true
    },
    dndPanel: {
      // 拖拽面板
      type: Array
    },
    initControl: {
      // 是否初始化控制面板
      type: Boolean,
      default: true
    },
    control: {
      // 控制面板
      type: Array
    },
    nodeClick: {
      // 节点点击事件
      type: Function
    },
    edgeClick: {
      // 边点击事件
      type: Function
    },
    blankContextmenu: {
      // 画布右键菜单
      type: Function
    },
    drawerWidth: {
      // 抽屉宽度
      type: [String, Number],
      default: "600px"
    },
    modalWidth: {
      // 弹窗宽度
      type: [String, Number],
      default: "60%"
    },
    processForm: {
      // 流程表单配置
      type: Object
    },
    edgeForm: {
      // 边表单配置
      type: Object
    },
    defaultEdgeType: {
      // 默认边
      type: String,
      default: "snaker:transition"
    },
    typePrefix: {
      // 自定义节点/边类型前缀,如snaker:task,snaker:transition，只是snaker:则为前辍
      type: String,
      default: "snaker:"
    },
    mode: {
      // 渲染模式
      type: String,
      default: void 0
    },
    viewer: {
      // 是否查看模式
      type: Boolean,
      default: false
    },
    dagreOptions: {
      // dagre配置
      type: Object,
      default: () => ({
        rankdir: "LR",
        align: "UR",
        nodesep: 100,
        ranksep: 80,
        ranker: "network-simplex",
        // 更智能的排名算法
        isDefaultAnchor: true,
        // 自动优化连线路径
        edgesep: 15
      })
    }
  };
  function isConditionNode(node) {
    return node.type === "condition";
  }
  function isForkNode(node) {
    return node.type === "fork";
  }
  function findNode(root, predicate) {
    if (!root) return null;
    if (predicate(root)) return root;
    if (root.branches) {
      const cond = root;
      for (const b of cond.branches) {
        if (b.children) {
          const found = findNode(b.children, predicate);
          if (found) return found;
        }
      }
    }
    if (root.branches) {
      const fork = root;
      for (const b of fork.branches) {
        if (b.children) {
          const found = findNode(b.children, predicate);
          if (found) return found;
        }
      }
      if (fork.joinChildren) {
        const found = findNode(fork.joinChildren, predicate);
        if (found) return found;
      }
    }
    if ("children" in root && root.children) {
      return findNode(root.children, predicate);
    }
    return null;
  }
  function flattenNodes(root, acc = [], seen = /* @__PURE__ */ new Set()) {
    if (!root) return acc;
    if (seen.has(root.id)) return acc;
    seen.add(root.id);
    acc.push(root);
    const cond = root;
    if (cond.branches) {
      for (const b of cond.branches) {
        if (b.children) flattenNodes(b.children, acc, seen);
      }
    }
    const fork = root;
    if (fork.branches) {
      for (const b of fork.branches) {
        if (b.children) flattenNodes(b.children, acc, seen);
      }
      if (fork.joinChildren) flattenNodes(fork.joinChildren, acc, seen);
    }
    if ("children" in root && root.children) flattenNodes(root.children, acc, seen);
    return acc;
  }
  const DEFAULT_PREFIX = "snaker:";
  function graphToTree(nodes, edges, typePrefix = DEFAULT_PREFIX) {
    if (!nodes.length) return void 0;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const outEdgesMap = buildOutEdgesMap(edges);
    const startNode = nodes.find((n) => n.type === `${typePrefix}start`);
    if (!startNode) return void 0;
    return buildChain(startNode.id, /* @__PURE__ */ new Set(), nodeMap, outEdgesMap, edges, typePrefix);
  }
  function buildChain(nodeId, stopIds, nodeMap, outEdgesMap, allEdges, prefix, visited = /* @__PURE__ */ new Set()) {
    var _a, _b;
    if (stopIds.has(nodeId)) return void 0;
    const graphNode = nodeMap.get(nodeId);
    if (!graphNode) return void 0;
    if (visited.has(nodeId)) {
      return {
        id: graphNode.id,
        type: graphNode.type,
        name: ((_a = graphNode.text) == null ? void 0 : _a.value) || "",
        properties: { ...graphNode.properties }
      };
    }
    visited.add(nodeId);
    const outEdges = outEdgesMap.get(nodeId) || [];
    const baseType = graphNode.type.replace(prefix, "");
    if (baseType === "decision" && outEdges.length > 1) {
      return buildConditionNode(graphNode, outEdges, stopIds, nodeMap, outEdgesMap, allEdges, prefix, visited);
    }
    if (baseType === "fork" && outEdges.length > 1) {
      return buildForkNode(graphNode, outEdges, stopIds, nodeMap, outEdgesMap, allEdges, prefix, visited);
    }
    const dingNode = {
      id: graphNode.id,
      type: graphNode.type,
      name: ((_b = graphNode.text) == null ? void 0 : _b.value) || "",
      properties: { ...graphNode.properties }
    };
    if (baseType === "end") return dingNode;
    if (outEdges.length === 1) {
      const next = buildChain(outEdges[0].targetNodeId, stopIds, nodeMap, outEdgesMap, allEdges, prefix, visited);
      if (next) dingNode.children = next;
    }
    return dingNode;
  }
  function buildConditionNode(graphNode, outEdges, parentStopIds, nodeMap, outEdgesMap, allEdges, prefix, visited) {
    var _a;
    const convergence = findCommonConvergence(
      outEdges.map((e) => e.targetNodeId),
      allEdges,
      graphNode.id,
      nodeMap,
      prefix
    );
    const branchStopIds = new Set(parentStopIds);
    if (convergence) branchStopIds.add(convergence);
    const branches = outEdges.map((edge) => {
      var _a2;
      const branchChildren = buildChain(
        edge.targetNodeId,
        branchStopIds,
        nodeMap,
        outEdgesMap,
        allEdges,
        prefix,
        visited
      );
      return {
        id: edge.id,
        name: ((_a2 = edge.text) == null ? void 0 : _a2.value) || "",
        properties: { ...edge.properties },
        children: branchChildren
      };
    });
    const condNode = {
      id: graphNode.id,
      type: "condition",
      name: ((_a = graphNode.text) == null ? void 0 : _a.value) || "",
      properties: { ...graphNode.properties },
      branches
    };
    if (convergence) {
      const next = buildChain(convergence, parentStopIds, nodeMap, outEdgesMap, allEdges, prefix, visited);
      if (next) condNode.children = next;
    }
    return condNode;
  }
  function buildForkNode(graphNode, outEdges, parentStopIds, nodeMap, outEdgesMap, allEdges, prefix, visited) {
    var _a;
    const joinId = findJoinNode(
      outEdges.map((e) => e.targetNodeId),
      allEdges,
      nodeMap,
      prefix
    );
    const branchStopIds = new Set(parentStopIds);
    if (joinId) branchStopIds.add(joinId);
    const branches = outEdges.map((edge) => {
      var _a2;
      const branchChildren = buildChain(
        edge.targetNodeId,
        branchStopIds,
        nodeMap,
        outEdgesMap,
        allEdges,
        prefix,
        visited
      );
      return {
        id: edge.id,
        name: ((_a2 = edge.text) == null ? void 0 : _a2.value) || "",
        properties: { ...edge.properties },
        children: branchChildren
      };
    });
    const forkNode = {
      id: graphNode.id,
      type: "fork",
      name: ((_a = graphNode.text) == null ? void 0 : _a.value) || "",
      properties: { ...graphNode.properties },
      branches
    };
    if (joinId) {
      forkNode.joinId = joinId;
      const joinChildren = buildChain(
        joinId,
        parentStopIds,
        nodeMap,
        outEdgesMap,
        allEdges,
        prefix,
        visited
      );
      if (joinChildren) forkNode.joinChildren = joinChildren;
    }
    return forkNode;
  }
  function findJoinNode(startIds, allEdges, nodeMap, prefix) {
    const outMap = buildOutEdgesMap(allEdges);
    const visited = /* @__PURE__ */ new Set();
    const queue = [...startIds];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      const node = nodeMap.get(current);
      if (node && node.type === `${prefix}join`) return current;
      const nextEdges = outMap.get(current) || [];
      for (const e of nextEdges) {
        if (!visited.has(e.targetNodeId)) queue.push(e.targetNodeId);
      }
    }
    return null;
  }
  function findCommonConvergence(branchTargets, allEdges, excludeId, nodeMap, prefix) {
    const outMap = buildOutEdgesMap(allEdges);
    const totalBranches = branchTargets.length;
    const reachCount = /* @__PURE__ */ new Map();
    for (const target of branchTargets) {
      const visited2 = /* @__PURE__ */ new Set();
      const queue2 = [target];
      while (queue2.length > 0) {
        const current = queue2.shift();
        if (visited2.has(current)) continue;
        visited2.add(current);
        reachCount.set(current, (reachCount.get(current) || 0) + 1);
        const nextEdges = outMap.get(current) || [];
        for (const e of nextEdges) {
          if (!visited2.has(e.targetNodeId)) queue2.push(e.targetNodeId);
        }
      }
    }
    const visited = /* @__PURE__ */ new Set([excludeId]);
    const queue = [...branchTargets];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      if (reachCount.get(current) === totalBranches) {
        return current;
      }
      const nextEdges = outMap.get(current) || [];
      for (const e of nextEdges) {
        if (!visited.has(e.targetNodeId)) queue.push(e.targetNodeId);
      }
    }
    if (nodeMap && prefix) {
      for (const [id, n] of nodeMap) {
        if (n.type === `${prefix}end`) return id;
      }
    }
    return null;
  }
  function treeToGraph(tree, typePrefix = DEFAULT_PREFIX) {
    if (!tree) return { nodes: [], edges: [] };
    const ctx = {
      nodes: [],
      edges: [],
      edgeCounter: 0,
      prefix: typePrefix,
      layoutY: 200,
      layoutX: 480
    };
    processNodeToGraph(tree, ctx);
    return { nodes: ctx.nodes, edges: ctx.edges };
  }
  function processNodeToGraph(dingNode, ctx) {
    if (isConditionNode(dingNode)) {
      return processConditionToGraph(dingNode, ctx);
    }
    if (isForkNode(dingNode)) {
      return processForkJoinToGraph(dingNode, ctx);
    }
    const graphNode = createGraphNode(dingNode, ctx);
    ctx.nodes.push(graphNode);
    if (dingNode.children) {
      const childId = processNodeToGraph(dingNode.children, ctx);
      addEdge(ctx, dingNode.id, childId);
    }
    return dingNode.id;
  }
  function processConditionToGraph(condNode, ctx) {
    const sourceNode = createGraphNode(
      { ...condNode, type: `${ctx.prefix}decision` },
      ctx
    );
    ctx.nodes.push(sourceNode);
    const savedY = ctx.layoutY;
    const branchCount = condNode.branches.length;
    const startX = ctx.layoutX - (branchCount - 1) * 200 / 2;
    for (let i = 0; i < branchCount; i++) {
      const branch = condNode.branches[i];
      const branchX = startX + i * 200;
      if (branch.children) {
        ctx.layoutX = branchX;
        ctx.layoutY = savedY + 150;
        const firstChildId = processNodeToGraph(branch.children, ctx);
        addEdge(ctx, condNode.id, firstChildId, branch.id, branch.name, branch.properties);
        if (condNode.children) {
          const lastId = findLastNodeId(branch.children);
          addEdge(ctx, lastId, condNode.children.id);
        }
      } else if (condNode.children) {
        addEdge(ctx, condNode.id, condNode.children.id, branch.id, branch.name, branch.properties);
      }
    }
    ctx.layoutX = sourceNode.x;
    ctx.layoutY = savedY + 150 * 2;
    if (condNode.children) {
      processNodeToGraph(condNode.children, ctx);
    }
    return condNode.id;
  }
  function processForkJoinToGraph(forkNode, ctx) {
    const sourceNode = createGraphNode(
      { ...forkNode, type: `${ctx.prefix}fork` },
      ctx
    );
    ctx.nodes.push(sourceNode);
    const savedY = ctx.layoutY;
    const branchCount = forkNode.branches.length;
    const startX = ctx.layoutX - (branchCount - 1) * 200 / 2;
    const joinNodeId = forkNode.joinId || (forkNode.joinChildren ? forkNode.joinChildren.id : null) || `${forkNode.id}__join`;
    for (let i = 0; i < branchCount; i++) {
      const branch = forkNode.branches[i];
      const branchX = startX + i * 200;
      if (!branch.children) {
        addEdge(ctx, forkNode.id, joinNodeId);
        continue;
      }
      ctx.layoutX = branchX;
      ctx.layoutY = savedY + 150;
      const firstChildId = processNodeToGraph(branch.children, ctx);
      addEdge(ctx, forkNode.id, firstChildId);
      const lastId = findLastNodeId(branch.children);
      addEdge(ctx, lastId, joinNodeId);
    }
    if (forkNode.joinChildren) {
      ctx.layoutX = sourceNode.x;
      ctx.layoutY = savedY + 150 * 2;
      processNodeToGraph(forkNode.joinChildren, ctx);
    }
    return forkNode.id;
  }
  function buildOutEdgesMap(edges) {
    const map = /* @__PURE__ */ new Map();
    for (const edge of edges) {
      const list = map.get(edge.sourceNodeId);
      if (list) list.push(edge);
      else map.set(edge.sourceNodeId, [edge]);
    }
    return map;
  }
  function createGraphNode(dingNode, ctx) {
    const x = ctx.layoutX;
    const y = ctx.layoutY;
    ctx.layoutY += 150;
    return {
      id: dingNode.id,
      type: dingNode.type,
      x,
      y,
      text: dingNode.name ? { x, y, value: dingNode.name } : void 0,
      properties: { ...dingNode.properties }
    };
  }
  function addEdge(ctx, sourceId, targetId, edgeId, name, properties) {
    const id = edgeId || `edge_${++ctx.edgeCounter}`;
    const edge = {
      id,
      type: `${ctx.prefix}transition`,
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      properties: properties ? { ...properties } : {}
    };
    if (name) edge.text = { value: name };
    ctx.edges.push(edge);
  }
  function findLastNodeId(node) {
    if (isConditionNode(node)) {
      if (node.children) return findLastNodeId(node.children);
      return node.id;
    }
    if (isForkNode(node)) {
      if (node.joinChildren) return findLastNodeId(node.joinChildren);
      return node.id;
    }
    if (node.children) return findLastNodeId(node.children);
    return node.id;
  }
  const DEFAULT_FLOW_NODES = [
    {
      id: "start",
      type: "snaker:start",
      x: 280,
      y: 280,
      properties: { width: 120, height: 80 },
      text: { x: 280, y: 320, value: "开始" }
    },
    {
      id: "apply",
      type: "snaker:task",
      x: 480,
      y: 280,
      properties: {
        width: 120,
        height: 80,
        // 发起申请节点：assignee = "applicant"（引擎解析为发起人）
        assignee: "applicant",
        taskType: "Major",
        performType: "ANY",
        autoExecute: "N"
      },
      text: { x: 480, y: 280, value: "发起申请" }
    },
    {
      id: "end",
      type: "snaker:end",
      x: 680,
      y: 280,
      properties: { width: 120, height: 80 },
      text: { x: 680, y: 320, value: "结束" }
    }
  ];
  const DEFAULT_FLOW_EDGES = [
    {
      id: "t1",
      type: "snaker:transition",
      sourceNodeId: "start",
      targetNodeId: "apply",
      properties: {}
    },
    {
      id: "t2",
      type: "snaker:transition",
      sourceNodeId: "apply",
      targetNodeId: "end",
      properties: {}
    }
  ];
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const _hoisted_1$j = ["type", "value", "placeholder", "disabled", "readonly"];
  const _sfc_main$k = /* @__PURE__ */ vue.defineComponent({
    __name: "FDInput",
    props: {
      modelValue: { default: "" },
      type: { default: "text" },
      placeholder: { default: "" },
      disabled: { type: Boolean, default: false },
      readonly: { type: Boolean, default: false }
    },
    emits: ["update:modelValue"],
    setup(__props, { emit: __emit }) {
      const emit = __emit;
      function onInput(evt) {
        emit("update:modelValue", evt.target.value);
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("input", {
          class: vue.normalizeClass(["fd-input", { "fd-input--disabled": _ctx.disabled }]),
          type: _ctx.type,
          value: _ctx.modelValue,
          placeholder: _ctx.placeholder,
          disabled: _ctx.disabled,
          readonly: _ctx.readonly,
          onInput
        }, null, 42, _hoisted_1$j);
      };
    }
  });
  const FDInput = /* @__PURE__ */ _export_sfc(_sfc_main$k, [["__scopeId", "data-v-cad5d2de"]]);
  const _hoisted_1$i = ["value", "placeholder", "disabled", "readonly", "rows"];
  const _sfc_main$j = /* @__PURE__ */ vue.defineComponent({
    __name: "FDTextarea",
    props: {
      modelValue: { default: "" },
      placeholder: { default: "" },
      rows: { default: 4 },
      disabled: { type: Boolean, default: false },
      readonly: { type: Boolean, default: false }
    },
    emits: ["update:modelValue"],
    setup(__props, { emit: __emit }) {
      const emit = __emit;
      function onInput(evt) {
        emit("update:modelValue", evt.target.value);
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("textarea", {
          class: vue.normalizeClass(["fd-textarea", { "fd-textarea--disabled": _ctx.disabled }]),
          value: _ctx.modelValue,
          placeholder: _ctx.placeholder,
          disabled: _ctx.disabled,
          readonly: _ctx.readonly,
          rows: _ctx.rows,
          onInput
        }, null, 42, _hoisted_1$i);
      };
    }
  });
  const FDTextarea = /* @__PURE__ */ _export_sfc(_sfc_main$j, [["__scopeId", "data-v-5c9a226f"]]);
  const _hoisted_1$h = {
    key: 0,
    class: "fd-select__value"
  };
  const _hoisted_2$c = {
    key: 1,
    class: "fd-select__placeholder"
  };
  const _hoisted_3$a = {
    key: 0,
    class: "fd-select__empty"
  };
  const _hoisted_4$7 = ["onClick"];
  const _sfc_main$i = /* @__PURE__ */ vue.defineComponent({
    __name: "FDSelect",
    props: {
      modelValue: {},
      options: { default: () => [] },
      placeholder: { default: "请选择" },
      disabled: { type: Boolean, default: false }
    },
    emits: ["update:modelValue", "change"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const open = vue.ref(false);
      const triggerRef = vue.ref(null);
      const dropdownPos = vue.ref({ x: 0, y: 0, w: 0 });
      const selectedLabel = vue.computed(() => {
        const matched = props.options.find((o) => o.value === props.modelValue);
        return matched == null ? void 0 : matched.label;
      });
      const dropdownStyle = vue.computed(() => ({
        left: `${dropdownPos.value.x}px`,
        top: `${dropdownPos.value.y}px`,
        minWidth: `${dropdownPos.value.w}px`
      }));
      function updatePos() {
        if (!triggerRef.value) return;
        const rect = triggerRef.value.getBoundingClientRect();
        dropdownPos.value = { x: rect.left, y: rect.bottom + 4, w: rect.width };
      }
      function toggle() {
        if (props.disabled) return;
        if (open.value) {
          open.value = false;
        } else {
          updatePos();
          open.value = true;
          vue.nextTick(() => {
            document.addEventListener("mousedown", handleOutsideClick);
          });
        }
      }
      function handleSelect(opt) {
        emit("update:modelValue", opt.value);
        emit("change", opt.value);
        open.value = false;
        document.removeEventListener("mousedown", handleOutsideClick);
      }
      function handleOutsideClick(e) {
        const target = e.target;
        if (triggerRef.value && triggerRef.value.contains(target)) return;
        open.value = false;
        document.removeEventListener("mousedown", handleOutsideClick);
      }
      vue.onMounted(() => {
        window.addEventListener("resize", updatePos);
      });
      vue.onBeforeUnmount(() => {
        document.removeEventListener("mousedown", handleOutsideClick);
        window.removeEventListener("resize", updatePos);
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: vue.normalizeClass(["fd-select", { "fd-select--open": open.value, "fd-select--disabled": _ctx.disabled }]),
          ref_key: "triggerRef",
          ref: triggerRef
        }, [
          vue.createElementVNode("div", {
            class: "fd-select__trigger",
            onClick: toggle
          }, [
            selectedLabel.value !== null && selectedLabel.value !== void 0 && selectedLabel.value !== "" ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_1$h, vue.toDisplayString(selectedLabel.value), 1)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_2$c, vue.toDisplayString(_ctx.placeholder), 1)),
            vue.createElementVNode("span", {
              class: vue.normalizeClass(["fd-select__arrow", { "fd-select__arrow--up": open.value }])
            }, _cache[0] || (_cache[0] = [
              vue.createElementVNode("svg", {
                width: "12",
                height: "12",
                viewBox: "0 0 12 12"
              }, [
                vue.createElementVNode("path", {
                  d: "M2.5 4.5L6 8l3.5-3.5",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "1.2",
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round"
                })
              ], -1)
            ]), 2)
          ]),
          (vue.openBlock(), vue.createBlock(vue.Teleport, { to: "body" }, [
            vue.createVNode(vue.Transition, { name: "fd-select-drop" }, {
              default: vue.withCtx(() => {
                var _a;
                return [
                  open.value ? (vue.openBlock(), vue.createElementBlock("div", {
                    key: 0,
                    class: "fd-select__dropdown",
                    style: vue.normalizeStyle(dropdownStyle.value)
                  }, [
                    !((_a = _ctx.options) == null ? void 0 : _a.length) ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_3$a, "暂无选项")) : vue.createCommentVNode("", true),
                    (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(_ctx.options, (opt) => {
                      return vue.openBlock(), vue.createElementBlock("div", {
                        key: String(opt.value),
                        class: vue.normalizeClass(["fd-select__option", { "fd-select__option--active": opt.value === _ctx.modelValue }]),
                        onClick: ($event) => handleSelect(opt)
                      }, vue.toDisplayString(opt.label), 11, _hoisted_4$7);
                    }), 128))
                  ], 4)) : vue.createCommentVNode("", true)
                ];
              }),
              _: 1
            })
          ]))
        ], 2);
      };
    }
  });
  const FDSelect = /* @__PURE__ */ _export_sfc(_sfc_main$i, [["__scopeId", "data-v-1cb90fb3"]]);
  const _hoisted_1$g = { class: "fd-tooltip__inner" };
  const _sfc_main$h = /* @__PURE__ */ vue.defineComponent({
    __name: "FDTooltip",
    props: {
      title: { default: "" },
      placement: { default: "top" },
      offset: { default: 8 }
    },
    setup(__props) {
      const props = __props;
      const visible = vue.ref(false);
      const triggerRef = vue.ref(null);
      const popupRef = vue.ref(null);
      const popupPos = vue.ref({ x: 0, y: 0 });
      function show2(_e) {
        visible.value = true;
        vue.nextTick(() => {
          if (!popupRef.value || !triggerRef.value) return;
          const rect = triggerRef.value.getBoundingClientRect();
          const popup = popupRef.value.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let x, y;
          switch (props.placement) {
            case "top":
              x = rect.left + rect.width / 2 - popup.width / 2;
              y = rect.top - popup.height - props.offset;
              break;
            case "bottom":
              x = rect.left + rect.width / 2 - popup.width / 2;
              y = rect.bottom + props.offset;
              break;
            case "left":
              x = rect.left - popup.width - props.offset;
              y = rect.top + rect.height / 2 - popup.height / 2;
              break;
            case "right":
              x = rect.right + props.offset;
              y = rect.top + rect.height / 2 - popup.height / 2;
              break;
          }
          x = Math.max(4, Math.min(x, vw - popup.width - 4));
          y = Math.max(4, Math.min(y, vh - popup.height - 4));
          popupPos.value = { x, y };
        });
      }
      function hide() {
        visible.value = false;
      }
      const popupStyle = vue.computed(() => ({
        left: `${popupPos.value.x}px`,
        top: `${popupPos.value.y}px`
      }));
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: "fd-tooltip",
          ref_key: "triggerRef",
          ref: triggerRef,
          onMouseenter: show2,
          onMouseleave: hide,
          onFocusin: show2,
          onFocusout: hide
        }, [
          vue.renderSlot(_ctx.$slots, "default", {}, void 0, true),
          (vue.openBlock(), vue.createBlock(vue.Teleport, { to: "body" }, [
            vue.createVNode(vue.Transition, { name: "fd-tooltip-fade" }, {
              default: vue.withCtx(() => [
                visible.value ? (vue.openBlock(), vue.createElementBlock("div", {
                  key: 0,
                  class: "fd-tooltip__popup",
                  style: vue.normalizeStyle(popupStyle.value),
                  ref_key: "popupRef",
                  ref: popupRef
                }, [
                  vue.createElementVNode("div", _hoisted_1$g, [
                    vue.renderSlot(_ctx.$slots, "content", {}, () => [
                      vue.createTextVNode(vue.toDisplayString(_ctx.title), 1)
                    ], true)
                  ])
                ], 4)) : vue.createCommentVNode("", true)
              ]),
              _: 3
            })
          ]))
        ], 544);
      };
    }
  });
  const FDTooltip = /* @__PURE__ */ _export_sfc(_sfc_main$h, [["__scopeId", "data-v-af8305c4"]]);
  const _hoisted_1$f = { class: "fd-drawer__header" };
  const _hoisted_2$b = { class: "fd-drawer__title" };
  const _hoisted_3$9 = { class: "fd-drawer__body" };
  const _hoisted_4$6 = {
    key: 0,
    class: "fd-drawer__footer"
  };
  const _hoisted_5$6 = ["disabled"];
  const _sfc_main$g = /* @__PURE__ */ vue.defineComponent({
    __name: "FDDrawer",
    props: {
      visible: { type: Boolean },
      title: { default: "" },
      width: { default: "420px" },
      cancelText: { default: "取消" },
      okText: { default: "确定" },
      okDisabled: { type: Boolean, default: false },
      showFooter: { type: Boolean, default: true },
      maskClosable: { type: Boolean, default: true },
      keyboard: { type: Boolean, default: true }
    },
    emits: ["update:visible", "ok", "cancel", "close"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const show2 = vue.ref(false);
      const opening = vue.ref(false);
      const closing = vue.ref(false);
      let closeTimer = null;
      const drawerRef = vue.ref(null);
      function open() {
        closing.value = false;
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        if (show2.value) {
          opening.value = true;
          return;
        }
        show2.value = true;
        document.body.style.overflow = "hidden";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            opening.value = true;
          });
        });
      }
      function silentClose() {
        if (!show2.value || closing.value) return;
        closing.value = true;
        opening.value = false;
        closeTimer = setTimeout(() => {
          closeTimer = null;
          show2.value = false;
          closing.value = false;
          document.body.style.overflow = "";
          emit("close");
        }, 260);
      }
      function internalClose() {
        silentClose();
        emit("update:visible", false);
        emit("cancel");
      }
      function handleOk() {
        emit("ok");
      }
      function handleMaskClick() {
        if (props.maskClosable) {
          internalClose();
        }
      }
      function handleKeydown(e) {
        if (!show2.value || !props.keyboard) return;
        if (e.key === "Escape") {
          internalClose();
        }
      }
      vue.watch(() => props.visible, (v) => {
        if (v) {
          open();
        } else {
          silentClose();
        }
      }, { immediate: true });
      vue.onMounted(() => {
        document.addEventListener("keydown", handleKeydown);
      });
      vue.onBeforeUnmount(() => {
        if (closeTimer) clearTimeout(closeTimer);
        document.removeEventListener("keydown", handleKeydown);
        document.body.style.overflow = "";
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createBlock(vue.Teleport, { to: "body" }, [
          show2.value ? (vue.openBlock(), vue.createElementBlock("div", {
            key: 0,
            class: vue.normalizeClass(["fd-drawer-root", { "fd-drawer-root--open": opening.value }]),
            onClick: vue.withModifiers(handleMaskClick, ["self"])
          }, [
            vue.createElementVNode("div", {
              class: vue.normalizeClass(["fd-drawer", { "fd-drawer--open": opening.value }]),
              style: vue.normalizeStyle({ width: _ctx.width }),
              ref_key: "drawerRef",
              ref: drawerRef
            }, [
              vue.createElementVNode("div", _hoisted_1$f, [
                vue.createElementVNode("span", _hoisted_2$b, vue.toDisplayString(_ctx.title), 1),
                vue.createElementVNode("button", {
                  class: "fd-drawer__close",
                  onClick: internalClose
                }, "×")
              ]),
              vue.createElementVNode("div", _hoisted_3$9, [
                vue.renderSlot(_ctx.$slots, "default", {}, void 0, true)
              ]),
              _ctx.$slots.footer || _ctx.showFooter ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_4$6, [
                vue.renderSlot(_ctx.$slots, "footer", {}, () => [
                  vue.createElementVNode("button", {
                    class: "fd-btn fd-btn--default",
                    onClick: internalClose
                  }, vue.toDisplayString(_ctx.cancelText), 1),
                  vue.createElementVNode("button", {
                    class: "fd-btn fd-btn--primary",
                    onClick: handleOk,
                    disabled: _ctx.okDisabled
                  }, vue.toDisplayString(_ctx.okText), 9, _hoisted_5$6)
                ], true)
              ])) : vue.createCommentVNode("", true)
            ], 6)
          ], 2)) : vue.createCommentVNode("", true)
        ]);
      };
    }
  });
  const FDDrawer = /* @__PURE__ */ _export_sfc(_sfc_main$g, [["__scopeId", "data-v-fe60ac00"]]);
  const _hoisted_1$e = { class: "fd-modal__header" };
  const _hoisted_2$a = { class: "fd-modal__title" };
  const _hoisted_3$8 = { class: "fd-modal__body" };
  const _hoisted_4$5 = {
    key: 0,
    class: "fd-modal__footer"
  };
  const _hoisted_5$5 = ["disabled"];
  const _sfc_main$f = /* @__PURE__ */ vue.defineComponent({
    __name: "FDModal",
    props: {
      visible: { type: Boolean },
      title: { default: "" },
      width: { default: "520px" },
      cancelText: { default: "取消" },
      okText: { default: "确定" },
      okDisabled: { type: Boolean, default: false },
      showFooter: { type: Boolean, default: true },
      maskClosable: { type: Boolean, default: true },
      keyboard: { type: Boolean, default: true }
    },
    emits: ["update:visible", "ok", "cancel", "close"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const modalRef = vue.ref(null);
      function handleOk() {
        emit("ok");
      }
      function handleCancel() {
        emit("update:visible", false);
        emit("cancel");
      }
      function handleOverlayClick() {
        if (props.maskClosable) {
          handleCancel();
        }
      }
      function handleKeydown(e) {
        if (!props.visible || !props.keyboard) return;
        if (e.key === "Escape") {
          handleCancel();
        }
      }
      vue.onMounted(() => {
        document.addEventListener("keydown", handleKeydown);
      });
      vue.onBeforeUnmount(() => {
        document.removeEventListener("keydown", handleKeydown);
      });
      vue.watch(() => props.visible, (v) => {
        document.body.style.overflow = v ? "hidden" : "";
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createBlock(vue.Teleport, { to: "body" }, [
          vue.createVNode(vue.Transition, { name: "fd-modal-fade" }, {
            default: vue.withCtx(() => [
              _ctx.visible ? (vue.openBlock(), vue.createElementBlock("div", {
                key: 0,
                class: "fd-modal-root",
                onClick: vue.withModifiers(handleOverlayClick, ["self"])
              }, [
                vue.createVNode(vue.Transition, { name: "fd-modal-zoom" }, {
                  default: vue.withCtx(() => [
                    _ctx.visible ? (vue.openBlock(), vue.createElementBlock("div", {
                      key: 0,
                      class: "fd-modal",
                      style: vue.normalizeStyle({ width: _ctx.width }),
                      ref_key: "modalRef",
                      ref: modalRef
                    }, [
                      vue.createElementVNode("div", _hoisted_1$e, [
                        vue.createElementVNode("span", _hoisted_2$a, vue.toDisplayString(_ctx.title), 1),
                        vue.createElementVNode("button", {
                          class: "fd-modal__close",
                          onClick: handleCancel
                        }, "×")
                      ]),
                      vue.createElementVNode("div", _hoisted_3$8, [
                        vue.renderSlot(_ctx.$slots, "default", {}, void 0, true)
                      ]),
                      _ctx.$slots.footer || _ctx.showFooter ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_4$5, [
                        vue.renderSlot(_ctx.$slots, "footer", {}, () => [
                          vue.createElementVNode("button", {
                            class: "fd-btn fd-btn--default",
                            onClick: handleCancel
                          }, vue.toDisplayString(_ctx.cancelText), 1),
                          vue.createElementVNode("button", {
                            class: "fd-btn fd-btn--primary",
                            onClick: handleOk,
                            disabled: _ctx.okDisabled
                          }, vue.toDisplayString(_ctx.okText), 9, _hoisted_5$5)
                        ], true)
                      ])) : vue.createCommentVNode("", true)
                    ], 4)) : vue.createCommentVNode("", true)
                  ]),
                  _: 3
                })
              ])) : vue.createCommentVNode("", true)
            ]),
            _: 3
          })
        ]);
      };
    }
  });
  const FDModal = /* @__PURE__ */ _export_sfc(_sfc_main$f, [["__scopeId", "data-v-eba16fb8"]]);
  const _hoisted_1$d = { class: "fd-form" };
  const _sfc_main$e = /* @__PURE__ */ vue.defineComponent({
    __name: "FDForm",
    props: {
      labelWidth: { default: "100px" }
    },
    setup(__props) {
      const props = __props;
      vue.provide("fdFormLabelWidth", vue.computed(() => props.labelWidth));
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$d, [
          vue.renderSlot(_ctx.$slots, "default", {}, void 0, true)
        ]);
      };
    }
  });
  const FDForm = /* @__PURE__ */ _export_sfc(_sfc_main$e, [["__scopeId", "data-v-50abc473"]]);
  const _hoisted_1$c = { class: "fd-form-item" };
  const _hoisted_2$9 = { class: "fd-form-item__content" };
  const _sfc_main$d = /* @__PURE__ */ vue.defineComponent({
    __name: "FDFormItem",
    props: {
      label: {}
    },
    setup(__props) {
      const injectedWidth = vue.inject("fdFormLabelWidth", vue.computed(() => "120px"));
      const labelWidth = vue.computed(() => injectedWidth.value);
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$c, [
          _ctx.label || _ctx.$slots.label ? (vue.openBlock(), vue.createElementBlock("div", {
            key: 0,
            class: "fd-form-item__label",
            style: vue.normalizeStyle({ width: labelWidth.value })
          }, [
            vue.renderSlot(_ctx.$slots, "label", {}, () => [
              vue.createTextVNode(vue.toDisplayString(_ctx.label), 1)
            ], true)
          ], 4)) : vue.createCommentVNode("", true),
          vue.createElementVNode("div", _hoisted_2$9, [
            vue.renderSlot(_ctx.$slots, "default", {}, void 0, true)
          ])
        ]);
      };
    }
  });
  const FDFormItem = /* @__PURE__ */ _export_sfc(_sfc_main$d, [["__scopeId", "data-v-d7b6a167"]]);
  const QuestionSvg = "data:image/svg+xml;base64,PHN2ZyB0PSIxNzMzMzE2NTM1ODkwIiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjQyOTMiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZD0iTTUxMS4wMjM3NTg2NiA4NzMuMjA5Mjk3OTVjLTkyLjc0MjkyNzg1IDAtMTg1LjcyOTkxNjA1LTM1LjM4ODc0ODc3LTI1Ni4yNjMzNTMyOS0xMDUuOTIyMTg2LTE0MS4zMTA5MzQ4MS0xNDEuMzEwOTM0ODEtMTQxLjMxMDkzNDgxLTM3MS4yMTU3NzE3NSAwLTUxMi41MjY3MDY1OCAxNDEuMzEwOTM0ODEtMTQxLjMxMDkzNDgxIDM3MS4yMTU3NzE3NS0xNDEuMzEwOTM0ODEgNTEyLjUyNjcwNjU4IDAgMTQxLjMxMDkzNDgxIDE0MS4zMTA5MzQ4MSAxNDEuMzEwOTM0ODEgMzcxLjIxNTc3MTc1IDAgNTEyLjUyNjcwNjU4LTcwLjc3NzQ5NzU4IDcwLjUzMzQzNzIzLTE2My41MjA0MjU0MyAxMDUuOTIyMTg2MDMtMjU2LjI2MzM1MzI5IDEwNS45MjIxODZ6IG0wLTY2My42MDAwNTQ4MWMtNzcuMTIzMDY2MzEgMC0xNTQuNDkwMTkyOTkgMjkuMjg3MjQwMzYtMjEzLjA2NDY3MzcxIDg4LjEwNTc4MTQ1LTExNy42MzcwODIxNyAxMTcuNjM3MDgyMTctMTE3LjYzNzA4MjE3IDMwOC43MzYzMjU2MiAwIDQyNi4zNzM0MDc4QzM1Ni43Nzc2MjU5OCA3ODIuOTA2OTczNDggNDMzLjkwMDY5MjMyIDgxMi4xOTQyMTM4NSA1MTEuMDIzNzU4NjYgODEyLjE5NDIxMzg1Yzc3LjEyMzA2NjMxIDAgMTU0LjI0NjEzMjY0LTI5LjI4NzI0MDM2IDIxMy4wNjQ2NzM3My04OC4xMDU3ODE0NiAxMTcuNjM3MDgyMTctMTE3LjYzNzA4MjE3IDExNy42MzcwODIxNy0zMDguNzM2MzI1NjIgMC00MjYuMzczNDA3OC01OC44MTg1NDExLTU4LjgxODU0MTEtMTM1Ljk0MTYwNzQxLTg4LjEwNTc4MTQ1LTIxMy4wNjQ2NzM3My04OC4xMDU3ODE0NXoiIGZpbGw9IiM4YThhOGEiIHAtaWQ9IjQyOTQiPjwvcGF0aD48cGF0aCBkPSJNNDc3LjgzMTU1MjkgMzExLjg3MDUyNDExaDYxLjAxNTA4NDF2MjY4LjQ2NjM3MDA5aC02MS4wMTUwODQxek00NzcuODMxNTUyOSA2MzguOTExMzc0OTVoNjEuMDE1MDg0MXY1Ni4xMzM4Nzc0MWgtNjEuMDE1MDg0MXoiIGZpbGw9IiM4YThhOGEiIHAtaWQ9IjQyOTUiPjwvcGF0aD48L3N2Zz4=";
  const _hoisted_1$b = ["src"];
  const _sfc_main$c = /* @__PURE__ */ vue.defineComponent({
    __name: "FDSchemaForm",
    props: {
      formItems: {},
      model: {},
      labelWidth: { default: "120px" },
      renderContext: {}
    },
    setup(__props) {
      return (_ctx, _cache) => {
        var _a;
        return ((_a = _ctx.formItems) == null ? void 0 : _a.length) ? (vue.openBlock(), vue.createBlock(FDForm, {
          key: 0,
          "label-width": _ctx.labelWidth
        }, {
          default: vue.withCtx(() => [
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(_ctx.formItems, (item) => {
              return vue.openBlock(), vue.createBlock(FDFormItem, {
                key: item.name,
                label: item.helpMessage && item.helpMessage.length ? void 0 : item.label
              }, vue.createSlots({
                default: vue.withCtx(() => [
                  item.component == "Input" ? (vue.openBlock(), vue.createBlock(FDInput, vue.mergeProps({
                    key: 0,
                    modelValue: _ctx.model[item.name],
                    "onUpdate:modelValue": ($event) => _ctx.model[item.name] = $event,
                    ref_for: true
                  }, { ...item.componentProps }), null, 16, ["modelValue", "onUpdate:modelValue"])) : item.component == "Select" ? (vue.openBlock(), vue.createBlock(FDSelect, vue.mergeProps({
                    key: 1,
                    modelValue: _ctx.model[item.name],
                    "onUpdate:modelValue": ($event) => _ctx.model[item.name] = $event,
                    ref_for: true
                  }, { ...item.componentProps }), null, 16, ["modelValue", "onUpdate:modelValue"])) : item.slot ? vue.renderSlot(_ctx.$slots, item.slot, vue.mergeProps({
                    key: 2,
                    ref_for: true
                  }, _ctx.renderContext)) : (vue.openBlock(), vue.createBlock(vue.resolveDynamicComponent(item.render ? item.render(_ctx.renderContext) : void 0), {
                    key: 3,
                    modelValue: _ctx.model[item.name],
                    "onUpdate:modelValue": ($event) => _ctx.model[item.name] = $event,
                    value: _ctx.model[item.name],
                    "onUpdate:value": ($event) => _ctx.model[item.name] = $event,
                    checked: _ctx.model[item.name],
                    "onUpdate:checked": ($event) => _ctx.model[item.name] = $event
                  }, null, 40, ["modelValue", "onUpdate:modelValue", "value", "onUpdate:value", "checked", "onUpdate:checked"]))
                ]),
                _: 2
              }, [
                item.helpMessage && item.helpMessage.length ? {
                  name: "label",
                  fn: vue.withCtx(() => [
                    vue.createTextVNode(vue.toDisplayString(item.label) + " ", 1),
                    vue.createVNode(FDTooltip, null, {
                      content: vue.withCtx(() => [
                        Array.isArray(item.helpMessage) ? (vue.openBlock(true), vue.createElementBlock(vue.Fragment, { key: 0 }, vue.renderList(item.helpMessage, (msg, i) => {
                          return vue.openBlock(), vue.createElementBlock("div", { key: i }, vue.toDisplayString(msg), 1);
                        }), 128)) : (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                          vue.createTextVNode(vue.toDisplayString(item.helpMessage), 1)
                        ], 64))
                      ]),
                      default: vue.withCtx(() => [
                        vue.createElementVNode("img", { src: vue.unref(QuestionSvg) }, null, 8, _hoisted_1$b)
                      ]),
                      _: 2
                    }, 1024)
                  ]),
                  key: "0"
                } : void 0
              ]), 1032, ["label"]);
            }), 128))
          ]),
          _: 3
        }, 8, ["label-width"])) : vue.createCommentVNode("", true);
      };
    }
  });
  const _hoisted_1$a = { class: "fd-json-node" };
  const _hoisted_2$8 = { class: "fd-json-key" };
  const _hoisted_3$7 = { class: "fd-json-bracket" };
  const _hoisted_4$4 = { class: "fd-json-ellipsis" };
  const _hoisted_5$4 = { class: "fd-json-bracket" };
  const _hoisted_6$2 = {
    key: 0,
    class: "fd-json-comma"
  };
  const _hoisted_7$2 = { class: "fd-json-bracket" };
  const _hoisted_8$1 = {
    key: 0,
    class: "fd-json-comma"
  };
  const _hoisted_9$1 = { class: "fd-json-key" };
  const _hoisted_10$1 = {
    key: 1,
    class: "fd-json-comma"
  };
  const _sfc_main$b = /* @__PURE__ */ vue.defineComponent({
    __name: "FDJsonNode",
    props: {
      name: { default: null },
      data: {},
      depth: { default: 0 },
      isLast: { type: Boolean, default: true },
      defaultExpandDepth: { default: 2 }
    },
    setup(__props) {
      const props = __props;
      const expanded = vue.ref(props.depth < props.defaultExpandDepth);
      const isExpandable = vue.computed(
        () => props.data !== null && typeof props.data === "object"
      );
      const isArray = vue.computed(() => Array.isArray(props.data));
      const openBracket = vue.computed(() => isArray.value ? "[" : "{");
      const closeBracket = vue.computed(() => isArray.value ? "]" : "}");
      const entries = vue.computed(() => {
        if (isArray.value) {
          return props.data.map((value) => ({ name: null, value }));
        }
        return Object.keys(props.data || {}).map((key) => ({ name: key, value: props.data[key] }));
      });
      const count = vue.computed(() => entries.value.length);
      const indent = vue.computed(() => `${props.depth * 16}px`);
      const valueType = vue.computed(() => {
        if (props.data === null) return "null";
        if (Array.isArray(props.data)) return "object";
        return typeof props.data;
      });
      const valueText = vue.computed(() => {
        switch (valueType.value) {
          case "string":
            return `"${props.data}"`;
          case "null":
            return "null";
          default:
            return String(props.data);
        }
      });
      const valueClass = vue.computed(() => `fd-json-value fd-json-value--${valueType.value}`);
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$a, [
          isExpandable.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
            vue.createElementVNode("div", {
              class: "fd-json-line",
              style: vue.normalizeStyle({ paddingLeft: indent.value })
            }, [
              vue.createElementVNode("span", {
                class: "fd-json-toggle",
                onClick: _cache[0] || (_cache[0] = ($event) => expanded.value = !expanded.value)
              }, vue.toDisplayString(expanded.value ? "▾" : "▸"), 1),
              _ctx.name !== null ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createElementVNode("span", _hoisted_2$8, '"' + vue.toDisplayString(_ctx.name) + '"', 1),
                _cache[1] || (_cache[1] = vue.createElementVNode("span", { class: "fd-json-colon" }, ": ", -1))
              ], 64)) : vue.createCommentVNode("", true),
              vue.createElementVNode("span", _hoisted_3$7, vue.toDisplayString(openBracket.value), 1),
              !expanded.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                vue.createElementVNode("span", _hoisted_4$4, "… " + vue.toDisplayString(count.value) + " 项 ", 1),
                vue.createElementVNode("span", _hoisted_5$4, vue.toDisplayString(closeBracket.value), 1),
                !_ctx.isLast ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_6$2, ",")) : vue.createCommentVNode("", true)
              ], 64)) : vue.createCommentVNode("", true)
            ], 4),
            expanded.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
              (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(entries.value, (child, idx) => {
                return vue.openBlock(), vue.createBlock(FDJsonNode, {
                  key: idx,
                  name: child.name,
                  data: child.value,
                  depth: _ctx.depth + 1,
                  "is-last": idx === entries.value.length - 1,
                  "default-expand-depth": _ctx.defaultExpandDepth
                }, null, 8, ["name", "data", "depth", "is-last", "default-expand-depth"]);
              }), 128)),
              vue.createElementVNode("div", {
                class: "fd-json-line",
                style: vue.normalizeStyle({ paddingLeft: indent.value })
              }, [
                _cache[2] || (_cache[2] = vue.createElementVNode("span", { class: "fd-json-toggle-placeholder" }, null, -1)),
                vue.createElementVNode("span", _hoisted_7$2, vue.toDisplayString(closeBracket.value), 1),
                !_ctx.isLast ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_8$1, ",")) : vue.createCommentVNode("", true)
              ], 4)
            ], 64)) : vue.createCommentVNode("", true)
          ], 64)) : (vue.openBlock(), vue.createElementBlock("div", {
            key: 1,
            class: "fd-json-line",
            style: vue.normalizeStyle({ paddingLeft: indent.value })
          }, [
            _cache[4] || (_cache[4] = vue.createElementVNode("span", { class: "fd-json-toggle-placeholder" }, null, -1)),
            _ctx.name !== null ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
              vue.createElementVNode("span", _hoisted_9$1, '"' + vue.toDisplayString(_ctx.name) + '"', 1),
              _cache[3] || (_cache[3] = vue.createElementVNode("span", { class: "fd-json-colon" }, ": ", -1))
            ], 64)) : vue.createCommentVNode("", true),
            vue.createElementVNode("span", {
              class: vue.normalizeClass(valueClass.value)
            }, vue.toDisplayString(valueText.value), 3),
            !_ctx.isLast ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_10$1, ",")) : vue.createCommentVNode("", true)
          ], 4))
        ]);
      };
    }
  });
  const FDJsonNode = /* @__PURE__ */ _export_sfc(_sfc_main$b, [["__scopeId", "data-v-5b631b70"]]);
  const _sfc_main$a = /* @__PURE__ */ vue.defineComponent({
    __name: "FDJsonViewer",
    props: {
      data: {},
      showLineNumber: { type: Boolean, default: false },
      defaultExpandDepth: { default: 2 }
    },
    setup(__props) {
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: vue.normalizeClass(["fd-json-viewer", { "fd-json-viewer--linenum": _ctx.showLineNumber }])
        }, [
          vue.createVNode(FDJsonNode, {
            data: _ctx.data,
            depth: 0,
            "is-last": true,
            "default-expand-depth": _ctx.defaultExpandDepth
          }, null, 8, ["data", "default-expand-depth"])
        ], 2);
      };
    }
  });
  const FDJsonViewer = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["__scopeId", "data-v-9494d430"]]);
  const CONTAINER_ID = "fd-message-container";
  const DURATION = 3e3;
  const ICONS = {
    success: '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="none" stroke="currentColor"/><path d="M4.2 7.2l1.9 1.9 3.7-4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="none" stroke="currentColor"/><path d="M5 5l4 4M9 5l-4 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="none" stroke="currentColor"/><path d="M7 6.5v3.5M7 4.2v.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };
  const COLORS = {
    success: "#52c41a",
    error: "#ff4d4f",
    info: "#1677ff"
  };
  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
.fd-message-container {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.fd-message-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  font-size: 14px;
  color: #333;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fd-message-item--in {
  opacity: 1;
  transform: translateY(0);
}
`;
    document.head.appendChild(style);
  }
  function getContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      container.className = "fd-message-container";
      document.body.appendChild(container);
    }
    return container;
  }
  function show(type, content, duration = DURATION) {
    if (typeof document === "undefined") return;
    injectStyle();
    const container = getContainer();
    const item = document.createElement("div");
    item.className = "fd-message-item";
    item.innerHTML = `<span style="color:${COLORS[type]};display:inline-flex;">${ICONS[type]}</span><span></span>`;
    item.lastElementChild.textContent = content;
    container.appendChild(item);
    requestAnimationFrame(() => {
      item.classList.add("fd-message-item--in");
    });
    setTimeout(() => {
      item.classList.remove("fd-message-item--in");
      setTimeout(() => {
        item.remove();
        if (!container.childElementCount) {
          container.remove();
        }
      }, 220);
    }, duration);
  }
  const FDMessage = {
    success: (content, duration) => show("success", content, duration),
    error: (content, duration) => show("error", content, duration),
    info: (content, duration) => show("info", content, duration)
  };
  const _hoisted_1$9 = { class: "ding-join-marker__inner" };
  const _hoisted_2$7 = { class: "ding-join-marker__name" };
  const _hoisted_3$6 = { class: "ding-node-card__header" };
  const _hoisted_4$3 = { class: "ding-node-card__icon" };
  const _hoisted_5$3 = { class: "ding-node-card__title" };
  const _hoisted_6$1 = {
    key: 1,
    class: "ding-node-card__actions"
  };
  const _hoisted_7$1 = { class: "ding-node-card__body" };
  const _hoisted_8 = {
    key: 0,
    class: "ding-node-card__members"
  };
  const _hoisted_9 = { class: "ding-node-card__member-mark" };
  const _hoisted_10 = { class: "ding-node-card__member-name" };
  const _sfc_main$9 = /* @__PURE__ */ vue.defineComponent({
    __name: "NodeCard",
    props: {
      node: {},
      typePrefix: {},
      viewer: { type: Boolean },
      highLight: {},
      theme: {},
      canDelete: { type: Boolean, default: true },
      depth: { default: 0 }
    },
    emits: ["edit", "delete"],
    setup(__props) {
      const props = __props;
      const baseType = vue.computed(() => {
        return props.node.type.replace(props.typePrefix, "");
      });
      const typeLabel = vue.computed(() => {
        switch (baseType.value) {
          case "task":
            return props.depth === 1 ? "申请人" : "审批人";
          case "custom":
            return "自定义节点";
          case "subProcess":
            return "子流程";
          default:
            return "任务";
        }
      });
      const typeIcon = vue.computed(() => {
        switch (baseType.value) {
          case "task":
            return "✓";
          case "custom":
            return "★";
          case "subProcess":
            return "▣";
          default:
            return "●";
        }
      });
      const isActive = vue.computed(() => {
        var _a;
        if (!((_a = props.highLight) == null ? void 0 : _a.activeNodeNames)) return false;
        return props.highLight.activeNodeNames.includes(props.node.id);
      });
      const isHistory = vue.computed(() => {
        var _a;
        if (!((_a = props.highLight) == null ? void 0 : _a.historyNodeNames)) return false;
        return props.highLight.historyNodeNames.includes(props.node.id);
      });
      const highlightClass = vue.computed(() => {
        if (isActive.value) return baseType.value === "start" || baseType.value === "end" ? "ding-node-pill--active" : "ding-node-card--active";
        if (isHistory.value) return baseType.value === "start" || baseType.value === "end" ? "ding-node-pill--history" : "ding-node-card--history";
        return "";
      });
      const countersignType = vue.computed(() => {
        var _a, _b, _c, _d;
        if (((_a = props.node.properties) == null ? void 0 : _a.performType) !== "ALL") return "";
        const raw = ((_b = props.node.properties) == null ? void 0 : _b.countersignType) || ((_d = (_c = props.node.properties) == null ? void 0 : _c.field) == null ? void 0 : _d.countersignType);
        return raw === "SEQUENTIAL" ? "SEQUENTIAL" : "PARALLEL";
      });
      const countersignBadge = vue.computed(() => {
        if (countersignType.value === "SEQUENTIAL") return "顺序会签";
        if (countersignType.value === "PARALLEL") return "并行会签";
        return "";
      });
      const countersignClass = vue.computed(() => {
        if (countersignType.value === "SEQUENTIAL") return "ding-node-card--seq-countersign";
        if (countersignType.value === "PARALLEL") return "ding-node-card--parallel-countersign";
        return "";
      });
      const nodeProgressMembers = vue.computed(() => {
        var _a, _b, _c;
        const progress = (_b = (_a = props.highLight) == null ? void 0 : _a.nodeProgress) == null ? void 0 : _b[props.node.id];
        if (!((_c = progress == null ? void 0 : progress.members) == null ? void 0 : _c.length)) return [];
        return progress.members.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          done: !!m.done,
          active: !!m.active
        }));
      });
      const barStyle = vue.computed(() => {
        var _a, _b, _c;
        if (isActive.value && ((_a = props.theme) == null ? void 0 : _a.activeColor)) {
          return { backgroundColor: props.theme.activeColor };
        }
        if (isHistory.value && ((_b = props.theme) == null ? void 0 : _b.historyColor)) {
          return { backgroundColor: props.theme.historyColor };
        }
        if (countersignType.value === "SEQUENTIAL") return { backgroundColor: "#fa8c16" };
        if (countersignType.value === "PARALLEL") return { backgroundColor: "#1677ff" };
        if ((_c = props.theme) == null ? void 0 : _c.primaryColor) {
          return { backgroundColor: props.theme.primaryColor };
        }
        return {};
      });
      return (_ctx, _cache) => {
        return baseType.value === "start" ? (vue.openBlock(), vue.createElementBlock("div", {
          key: 0,
          class: vue.normalizeClass(["ding-node-pill", "ding-node-pill--start", highlightClass.value, { "is-clickable": !_ctx.viewer }]),
          onClick: _cache[0] || (_cache[0] = ($event) => !_ctx.viewer && _ctx.$emit("edit", _ctx.node))
        }, " 开始 ", 2)) : baseType.value === "end" ? (vue.openBlock(), vue.createElementBlock("div", {
          key: 1,
          class: vue.normalizeClass(["ding-node-pill", "ding-node-pill--end", highlightClass.value, { "is-clickable": !_ctx.viewer }]),
          onClick: _cache[1] || (_cache[1] = ($event) => !_ctx.viewer && _ctx.$emit("edit", _ctx.node))
        }, " 结束 ", 2)) : baseType.value === "join" ? (vue.openBlock(), vue.createElementBlock("div", {
          key: 2,
          class: vue.normalizeClass(["ding-condition-group", "ding-join-marker", highlightClass.value, { "is-clickable": !_ctx.viewer }]),
          onClick: _cache[2] || (_cache[2] = ($event) => !_ctx.viewer && _ctx.$emit("edit", _ctx.node))
        }, [
          _cache[6] || (_cache[6] = vue.createElementVNode("div", { class: "ding-condition-group__header" }, [
            vue.createElementVNode("span", { class: "ding-condition-group__title" }, "合并节点")
          ], -1)),
          vue.createElementVNode("div", _hoisted_1$9, [
            _cache[5] || (_cache[5] = vue.createElementVNode("span", { class: "ding-join-marker__dot" }, null, -1)),
            vue.createElementVNode("span", _hoisted_2$7, vue.toDisplayString(_ctx.node.name || "合并点"), 1)
          ])
        ], 2)) : (vue.openBlock(), vue.createElementBlock("div", {
          key: 3,
          class: vue.normalizeClass(["ding-node-card", highlightClass.value, countersignClass.value]),
          onClick: _cache[4] || (_cache[4] = ($event) => _ctx.$emit("edit", _ctx.node))
        }, [
          vue.createElementVNode("div", {
            class: "ding-node-card__bar",
            style: vue.normalizeStyle(barStyle.value)
          }, null, 4),
          vue.createElementVNode("div", _hoisted_3$6, [
            vue.createElementVNode("span", _hoisted_4$3, vue.toDisplayString(typeIcon.value), 1),
            vue.createElementVNode("span", _hoisted_5$3, vue.toDisplayString(typeLabel.value), 1),
            countersignBadge.value ? (vue.openBlock(), vue.createElementBlock("span", {
              key: 0,
              class: vue.normalizeClass(["ding-node-card__badge", `ding-node-card__badge--${countersignType.value}`])
            }, vue.toDisplayString(countersignBadge.value), 3)) : vue.createCommentVNode("", true),
            !_ctx.viewer ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_6$1, [
              _ctx.canDelete ? (vue.openBlock(), vue.createElementBlock("button", {
                key: 0,
                class: "ding-node-card__action-btn ding-node-card__action-btn--delete",
                onClick: _cache[3] || (_cache[3] = vue.withModifiers(($event) => _ctx.$emit("delete", _ctx.node), ["stop"])),
                title: "删除"
              }, " × ")) : vue.createCommentVNode("", true)
            ])) : vue.createCommentVNode("", true)
          ]),
          vue.createVNode(vue.unref(FDTooltip), {
            title: _ctx.node.name || "未命名节点"
          }, {
            default: vue.withCtx(() => [
              vue.createElementVNode("div", _hoisted_7$1, vue.toDisplayString(_ctx.node.name || "未命名节点"), 1)
            ]),
            _: 1
          }, 8, ["title"]),
          nodeProgressMembers.value.length ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_8, [
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(nodeProgressMembers.value, (m) => {
              return vue.openBlock(), vue.createElementBlock("div", {
                key: m.id,
                class: vue.normalizeClass(["ding-node-card__member", { "is-done": m.done, "is-active": m.active }])
              }, [
                vue.createElementVNode("span", _hoisted_9, vue.toDisplayString(m.done ? "✓" : m.active ? "▶" : "·"), 1),
                vue.createElementVNode("span", _hoisted_10, vue.toDisplayString(m.name), 1)
              ], 2);
            }), 128))
          ])) : vue.createCommentVNode("", true)
        ], 2));
      };
    }
  });
  const _hoisted_1$8 = {
    key: 0,
    class: "ding-node-selector"
  };
  const _hoisted_2$6 = ["onClick"];
  const _sfc_main$8 = /* @__PURE__ */ vue.defineComponent({
    __name: "NodeSelector",
    props: {
      visible: { type: Boolean },
      dndPanel: {},
      typePrefix: {}
    },
    emits: ["select", "update:visible"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const panelRef = vue.ref(null);
      const filteredItems = vue.computed(() => {
        if (!props.dndPanel) return [];
        return props.dndPanel.filter((item) => {
          if (!item.type) return false;
          if (item.hide) return false;
          const baseType = item.type.replace(props.typePrefix, "");
          return !["start", "end", "decision", "fork", "join"].includes(baseType);
        });
      });
      function getIconClass(item) {
        if (!item.type) return "";
        const baseType = item.type.replace(props.typePrefix, "");
        switch (baseType) {
          case "task":
            return "ding-node-selector__item__icon--task";
          case "custom":
            return "ding-node-selector__item__icon--custom";
          case "subProcess":
            return "ding-node-selector__item__icon--subprocess";
          default:
            return "ding-node-selector__item__icon--task";
        }
      }
      function getIconText(item) {
        if (!item.type) return "?";
        const baseType = item.type.replace(props.typePrefix, "");
        switch (baseType) {
          case "task":
            return "✓";
          case "custom":
            return "★";
          case "subProcess":
            return "▣";
          default:
            return "✓";
        }
      }
      function getDefaultLabel(item) {
        if (!item.type) return "未知";
        const baseType = item.type.replace(props.typePrefix, "");
        switch (baseType) {
          case "task":
            return "审批节点";
          case "custom":
            return "自定义节点";
          case "subProcess":
            return "子流程";
          default:
            return item.type;
        }
      }
      function handleSelect(item) {
        if (item.type) {
          emit("select", item.type);
        }
        close();
      }
      function handleSelectCondition() {
        emit("select", "__condition__");
        close();
      }
      function handleSelectParallel() {
        emit("select", "__parallel__");
        close();
      }
      function close() {
        emit("update:visible", false);
      }
      function handleDocumentClick(e) {
        var _a;
        if (!props.visible) return;
        const target = e.target;
        if (!target) return;
        if ((_a = panelRef.value) == null ? void 0 : _a.contains(target)) return;
        close();
      }
      vue.onMounted(() => document.addEventListener("click", handleDocumentClick));
      vue.onBeforeUnmount(() => document.removeEventListener("click", handleDocumentClick));
      return (_ctx, _cache) => {
        return _ctx.visible ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_1$8, [
          vue.createElementVNode("div", {
            ref_key: "panelRef",
            ref: panelRef,
            class: "ding-node-selector__panel"
          }, [
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(filteredItems.value, (item) => {
              return vue.openBlock(), vue.createElementBlock("div", {
                key: item.type,
                class: "ding-node-selector__item",
                onClick: ($event) => handleSelect(item)
              }, [
                vue.createElementVNode("span", {
                  class: vue.normalizeClass(["ding-node-selector__item__icon", getIconClass(item)])
                }, vue.toDisplayString(getIconText(item)), 3),
                vue.createElementVNode("span", null, vue.toDisplayString(item.label || item.text || getDefaultLabel(item)), 1)
              ], 8, _hoisted_2$6);
            }), 128)),
            vue.createElementVNode("div", {
              class: "ding-node-selector__item",
              onClick: handleSelectCondition
            }, _cache[0] || (_cache[0] = [
              vue.createElementVNode("span", { class: "ding-node-selector__item__icon ding-node-selector__item__icon--condition" }, " ✦ ", -1),
              vue.createElementVNode("span", null, "条件分支", -1)
            ])),
            vue.createElementVNode("div", {
              class: "ding-node-selector__item",
              onClick: handleSelectParallel
            }, _cache[1] || (_cache[1] = [
              vue.createElementVNode("span", { class: "ding-node-selector__item__icon ding-node-selector__item__icon--parallel" }, " ≣ ", -1),
              vue.createElementVNode("span", null, "并行分支", -1)
            ]))
          ], 512)
        ])) : vue.createCommentVNode("", true);
      };
    }
  });
  const _hoisted_1$7 = {
    key: 0,
    class: "ding-add-btn"
  };
  const _hoisted_2$5 = {
    key: 1,
    class: "ding-add-btn ding-add-btn--readonly"
  };
  const _hoisted_3$5 = {
    key: 2,
    class: "ding-add-btn"
  };
  const _sfc_main$7 = /* @__PURE__ */ vue.defineComponent({
    __name: "AddButton",
    props: {
      viewer: { type: Boolean },
      typePrefix: {},
      dndPanel: {},
      readonly: { type: Boolean, default: false },
      prevNodeId: { default: void 0 },
      nextNodeId: { default: void 0 },
      highLight: {}
    },
    emits: ["add"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const lineState = vue.computed(() => {
        if (!props.highLight || !props.prevNodeId || !props.nextNodeId) return "default";
        const active = props.highLight.activeNodeNames || [];
        const history = props.highLight.historyNodeNames || [];
        if (active.length && history.includes(props.prevNodeId) && active.includes(props.nextNodeId)) {
          return "active";
        }
        if (history.includes(props.prevNodeId) && history.includes(props.nextNodeId)) {
          return "history";
        }
        return "default";
      });
      const lineClass = vue.computed(() => {
        const s = lineState.value;
        return s === "default" ? "" : `ding-line-vertical--${s}`;
      });
      const emit = __emit;
      const showSelector = vue.ref(false);
      function toggleSelector() {
        showSelector.value = !showSelector.value;
      }
      function handleSelect(nodeType) {
        emit("add", nodeType);
        showSelector.value = false;
      }
      return (_ctx, _cache) => {
        return !_ctx.viewer && !_ctx.readonly ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_1$7, [
          vue.createElementVNode("div", {
            class: vue.normalizeClass(["ding-line-vertical", lineClass.value])
          }, null, 2),
          vue.createElementVNode("button", {
            class: "ding-add-btn__circle",
            onClick: vue.withModifiers(toggleSelector, ["stop"])
          }, "+"),
          vue.createElementVNode("div", {
            class: vue.normalizeClass(["ding-line-vertical", lineClass.value])
          }, null, 2),
          vue.createVNode(_sfc_main$8, {
            visible: showSelector.value,
            "dnd-panel": _ctx.dndPanel,
            "type-prefix": _ctx.typePrefix,
            "onUpdate:visible": _cache[0] || (_cache[0] = ($event) => showSelector.value = $event),
            onSelect: handleSelect
          }, null, 8, ["visible", "dnd-panel", "type-prefix"])
        ])) : !_ctx.viewer && _ctx.readonly ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_2$5, [
          vue.createElementVNode("div", {
            class: vue.normalizeClass(["ding-line-vertical ding-line-vertical--short", lineClass.value])
          }, null, 2)
        ])) : (vue.openBlock(), vue.createElementBlock("div", _hoisted_3$5, [
          vue.createElementVNode("div", {
            class: vue.normalizeClass(["ding-line-vertical", lineClass.value])
          }, null, 2)
        ]));
      };
    }
  });
  const _hoisted_1$6 = { class: "ding-branch-col" };
  const _hoisted_2$4 = ["title"];
  const _hoisted_3$4 = { class: "ding-branch-col__head-text" };
  const _hoisted_4$2 = {
    key: 0,
    class: "ding-branch-col__head-edit",
    title: "编辑分支"
  };
  const _hoisted_5$2 = { class: "ding-branch-col__content" };
  const _sfc_main$6 = /* @__PURE__ */ vue.defineComponent({
    __name: "BranchColumn",
    props: {
      branch: {},
      typePrefix: {},
      viewer: { type: Boolean },
      highLight: {},
      theme: {},
      dndPanel: {},
      canDeleteChecker: { type: Function }
    },
    emits: ["edit", "delete", "add", "add-branch", "edit-branch", "add-to-branch"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      function handleEditBranch() {
        if (props.viewer) return;
        emit("edit-branch", props.branch);
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$6, [
          _cache[6] || (_cache[6] = vue.createElementVNode("div", { class: "ding-branch-col__line-top" }, null, -1)),
          _ctx.branch.name || !_ctx.viewer ? (vue.openBlock(), vue.createElementBlock("div", {
            key: 0,
            class: "ding-branch-col__head",
            title: _ctx.branch.name || "点击编辑",
            onClick: handleEditBranch
          }, [
            vue.createElementVNode("span", _hoisted_3$4, vue.toDisplayString(_ctx.branch.name || "未命名"), 1),
            !_ctx.viewer ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_4$2, " ✎ ")) : vue.createCommentVNode("", true)
          ], 8, _hoisted_2$4)) : vue.createCommentVNode("", true),
          vue.createElementVNode("div", _hoisted_5$2, [
            _ctx.branch.children ? (vue.openBlock(), vue.createBlock(_sfc_main$3, {
              key: 0,
              node: _ctx.branch.children,
              "type-prefix": _ctx.typePrefix,
              viewer: _ctx.viewer,
              "high-light": _ctx.highLight,
              theme: _ctx.theme,
              "dnd-panel": _ctx.dndPanel,
              "can-delete-checker": _ctx.canDeleteChecker,
              onEdit: _cache[0] || (_cache[0] = (n) => _ctx.$emit("edit", n)),
              onDelete: _cache[1] || (_cache[1] = (n) => _ctx.$emit("delete", n)),
              onAdd: _cache[2] || (_cache[2] = (nodeType, parentNode) => _ctx.$emit("add", nodeType, parentNode)),
              onAddBranch: _cache[3] || (_cache[3] = (n) => _ctx.$emit("add-branch", n)),
              onEditBranch: _cache[4] || (_cache[4] = (b) => _ctx.$emit("edit-branch", b))
            }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "can-delete-checker"])) : (vue.openBlock(), vue.createBlock(_sfc_main$7, {
              key: 1,
              viewer: _ctx.viewer,
              "type-prefix": _ctx.typePrefix,
              "dnd-panel": _ctx.dndPanel,
              onAdd: _cache[5] || (_cache[5] = (nodeType) => _ctx.$emit("add-to-branch", nodeType, _ctx.branch))
            }, null, 8, ["viewer", "type-prefix", "dnd-panel"]))
          ]),
          _cache[7] || (_cache[7] = vue.createElementVNode("div", { class: "ding-branch-col__line-bottom" }, null, -1))
        ]);
      };
    }
  });
  const _hoisted_1$5 = { class: "ding-condition-group" };
  const _hoisted_2$3 = { class: "ding-condition-group__header" };
  const _hoisted_3$3 = ["title"];
  const _sfc_main$5 = /* @__PURE__ */ vue.defineComponent({
    __name: "ConditionGroup",
    props: {
      node: {},
      typePrefix: {},
      viewer: { type: Boolean },
      highLight: {},
      theme: {},
      dndPanel: {},
      protectedIds: { default: () => /* @__PURE__ */ new Set() },
      canDeleteChecker: {}
    },
    emits: ["edit", "delete", "add", "add-branch", "edit-branch", "add-to-branch"],
    setup(__props) {
      const props = __props;
      const protectedIdsComputed = vue.computed(() => props.protectedIds ?? /* @__PURE__ */ new Set());
      const branchesRef = vue.ref();
      const lineWidth = vue.ref("0px");
      const lineLeft = vue.ref("0px");
      let resizeObserver = null;
      function updateLines() {
        if (!branchesRef.value) return;
        const container = branchesRef.value;
        const cols = container.querySelectorAll(".ding-branch-col");
        if (cols.length < 2) {
          lineWidth.value = "0px";
          return;
        }
        const first = cols[0];
        const last = cols[cols.length - 1];
        const containerRect = container.getBoundingClientRect();
        const firstCenter = first.getBoundingClientRect().left + first.offsetWidth / 2 - containerRect.left;
        const lastCenter = last.getBoundingClientRect().left + last.offsetWidth / 2 - containerRect.left;
        lineWidth.value = `${lastCenter - firstCenter}px`;
        lineLeft.value = `${firstCenter}px`;
      }
      const topLineStyle = vue.computed(() => ({
        width: lineWidth.value,
        left: lineLeft.value
      }));
      const bottomLineStyle = vue.computed(() => ({
        width: lineWidth.value,
        left: lineLeft.value
      }));
      vue.onMounted(() => {
        vue.nextTick(() => {
          updateLines();
          if (branchesRef.value && typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => updateLines());
            resizeObserver.observe(branchesRef.value);
          }
        });
      });
      vue.onBeforeUnmount(() => {
        resizeObserver == null ? void 0 : resizeObserver.disconnect();
      });
      vue.watch(() => props.node.branches.length, () => {
        vue.nextTick(updateLines);
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$5, [
          vue.createElementVNode("div", _hoisted_2$3, [
            vue.createElementVNode("span", {
              class: vue.normalizeClass(["ding-condition-group__title", { "ding-condition-group__title--clickable": !_ctx.viewer }]),
              title: !_ctx.viewer ? "点击编辑决策配置" : "",
              onClick: _cache[0] || (_cache[0] = ($event) => !_ctx.viewer && _ctx.$emit("edit", _ctx.node))
            }, "条件分支", 10, _hoisted_3$3),
            !_ctx.viewer ? (vue.openBlock(), vue.createElementBlock("span", {
              key: 0,
              class: "ding-condition-group__add-branch",
              onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("add-branch", _ctx.node))
            }, " + 添加条件 ")) : vue.createCommentVNode("", true),
            !_ctx.viewer && !protectedIdsComputed.value.has(_ctx.node.id) ? (vue.openBlock(), vue.createElementBlock("button", {
              key: 1,
              class: "ding-condition-group__delete",
              title: "删除整个条件分支组",
              onClick: _cache[2] || (_cache[2] = ($event) => _ctx.$emit("delete", _ctx.node))
            }, "×")) : vue.createCommentVNode("", true)
          ]),
          vue.createElementVNode("div", {
            class: "ding-condition-group__branches",
            ref_key: "branchesRef",
            ref: branchesRef
          }, [
            vue.createElementVNode("div", {
              class: "ding-condition-group__top-line",
              style: vue.normalizeStyle(topLineStyle.value)
            }, null, 4),
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(_ctx.node.branches, (branch, index) => {
              return vue.openBlock(), vue.createBlock(_sfc_main$6, {
                key: branch.id,
                branch,
                "type-prefix": _ctx.typePrefix,
                viewer: _ctx.viewer,
                "high-light": _ctx.highLight,
                theme: _ctx.theme,
                "dnd-panel": _ctx.dndPanel,
                "can-delete-checker": _ctx.canDeleteChecker,
                onEdit: _cache[3] || (_cache[3] = (n) => _ctx.$emit("edit", n)),
                onDelete: _cache[4] || (_cache[4] = (n) => _ctx.$emit("delete", n)),
                onAdd: (nodeType, parentNode) => _ctx.$emit("add", nodeType, parentNode, index),
                onAddBranch: _cache[5] || (_cache[5] = (n) => _ctx.$emit("add-branch", n)),
                onEditBranch: _cache[6] || (_cache[6] = (b) => _ctx.$emit("edit-branch", b)),
                onAddToBranch: _cache[7] || (_cache[7] = (nodeType, b) => _ctx.$emit("add-to-branch", nodeType, b))
              }, null, 8, ["branch", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "can-delete-checker", "onAdd"]);
            }), 128)),
            vue.createElementVNode("div", {
              class: "ding-condition-group__bottom-line",
              style: vue.normalizeStyle(bottomLineStyle.value)
            }, null, 4)
          ], 512)
        ]);
      };
    }
  });
  const _hoisted_1$4 = { class: "ding-condition-group ding-parallel-group" };
  const _hoisted_2$2 = { class: "ding-condition-group__header" };
  const _hoisted_3$2 = {
    key: 0,
    class: "ding-branch-col__head ding-branch-col__head--static"
  };
  const _hoisted_4$1 = { class: "ding-branch-col__head-text" };
  const _hoisted_5$1 = { class: "ding-branch-col__content" };
  const _hoisted_6 = {
    key: 0,
    class: "ding-branch-col__empty"
  };
  const _hoisted_7 = {
    key: 0,
    class: "ding-line-vertical"
  };
  const _sfc_main$4 = /* @__PURE__ */ vue.defineComponent({
    __name: "ParallelGroup",
    props: {
      node: {},
      typePrefix: {},
      viewer: { type: Boolean },
      highLight: {},
      theme: {},
      dndPanel: {},
      protectedIds: { default: () => /* @__PURE__ */ new Set() },
      canDeleteChecker: {}
    },
    emits: ["edit", "delete", "add", "add-branch", "edit-branch", "add-to-branch"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const protectedIdsComputed = vue.computed(() => props.protectedIds ?? /* @__PURE__ */ new Set());
      const branchesRef = vue.ref();
      const lineWidth = vue.ref("0px");
      const lineLeft = vue.ref("0px");
      function updateLines() {
        if (!branchesRef.value) return;
        const container = branchesRef.value;
        const cols = container.querySelectorAll(".ding-branch-col");
        if (cols.length < 2) {
          lineWidth.value = "0px";
          return;
        }
        const first = cols[0];
        const last = cols[cols.length - 1];
        const containerRect = container.getBoundingClientRect();
        const firstCenter = first.getBoundingClientRect().left + first.offsetWidth / 2 - containerRect.left;
        const lastCenter = last.getBoundingClientRect().left + last.offsetWidth / 2 - containerRect.left;
        lineWidth.value = `${lastCenter - firstCenter}px`;
        lineLeft.value = `${firstCenter}px`;
      }
      const topLineStyle = vue.computed(() => ({
        width: lineWidth.value,
        left: lineLeft.value
      }));
      const bottomLineStyle = vue.computed(() => ({
        width: lineWidth.value,
        left: lineLeft.value
      }));
      vue.onMounted(() => {
        vue.nextTick(updateLines);
      });
      vue.watch(() => props.node.branches.length, () => {
        vue.nextTick(updateLines);
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$4, [
          vue.createElementVNode("div", _hoisted_2$2, [
            _cache[13] || (_cache[13] = vue.createElementVNode("span", { class: "ding-condition-group__title" }, "并行分支", -1)),
            !_ctx.viewer ? (vue.openBlock(), vue.createElementBlock("span", {
              key: 0,
              class: "ding-condition-group__add-branch",
              onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("add-branch", _ctx.node))
            }, " + 添加分支 ")) : vue.createCommentVNode("", true),
            !_ctx.viewer && !protectedIdsComputed.value.has(_ctx.node.id) ? (vue.openBlock(), vue.createElementBlock("button", {
              key: 1,
              class: "ding-condition-group__delete",
              title: "删除整个并行分支组",
              onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("delete", _ctx.node))
            }, "×")) : vue.createCommentVNode("", true)
          ]),
          vue.createElementVNode("div", {
            class: "ding-condition-group__branches",
            ref_key: "branchesRef",
            ref: branchesRef
          }, [
            vue.createElementVNode("div", {
              class: "ding-condition-group__top-line",
              style: vue.normalizeStyle(topLineStyle.value)
            }, null, 4),
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(_ctx.node.branches, (branch, index) => {
              return vue.openBlock(), vue.createElementBlock("div", {
                key: branch.id,
                class: "ding-branch-col"
              }, [
                _cache[15] || (_cache[15] = vue.createElementVNode("div", { class: "ding-branch-col__line-top" }, null, -1)),
                !_ctx.viewer ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_3$2, [
                  vue.createElementVNode("span", _hoisted_4$1, "分支 " + vue.toDisplayString(index + 1), 1)
                ])) : vue.createCommentVNode("", true),
                vue.createElementVNode("div", _hoisted_5$1, [
                  branch.children ? (vue.openBlock(), vue.createBlock(_sfc_main$3, {
                    key: 0,
                    node: branch.children,
                    "type-prefix": _ctx.typePrefix,
                    viewer: _ctx.viewer,
                    "high-light": _ctx.highLight,
                    theme: _ctx.theme,
                    "dnd-panel": _ctx.dndPanel,
                    "can-delete-checker": _ctx.canDeleteChecker,
                    onEdit: _cache[2] || (_cache[2] = (n) => _ctx.$emit("edit", n)),
                    onDelete: _cache[3] || (_cache[3] = (n) => _ctx.$emit("delete", n)),
                    onAdd: _cache[4] || (_cache[4] = (nodeType, parentNode) => _ctx.$emit("add", nodeType, parentNode)),
                    onAddBranch: _cache[5] || (_cache[5] = (n) => _ctx.$emit("add-branch", n)),
                    onEditBranch: _cache[6] || (_cache[6] = (b) => _ctx.$emit("edit-branch", b))
                  }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "can-delete-checker"])) : (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                    !_ctx.viewer ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_6, [
                      _cache[14] || (_cache[14] = vue.createElementVNode("div", { class: "ding-branch-col__empty-hint" }, "点击 + 添加任务节点", -1)),
                      vue.createVNode(_sfc_main$7, {
                        viewer: _ctx.viewer,
                        "type-prefix": _ctx.typePrefix,
                        "dnd-panel": _ctx.dndPanel,
                        onAdd: (nodeType) => _ctx.$emit("add-to-branch", nodeType, branch)
                      }, null, 8, ["viewer", "type-prefix", "dnd-panel", "onAdd"])
                    ])) : vue.createCommentVNode("", true)
                  ], 64))
                ]),
                _cache[16] || (_cache[16] = vue.createElementVNode("div", { class: "ding-branch-col__line-bottom" }, null, -1))
              ]);
            }), 128)),
            vue.createElementVNode("div", {
              class: "ding-condition-group__bottom-line",
              style: vue.normalizeStyle(bottomLineStyle.value)
            }, null, 4)
          ], 512),
          _ctx.node.joinChildren ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_7)) : vue.createCommentVNode("", true),
          _ctx.node.joinChildren ? (vue.openBlock(), vue.createBlock(_sfc_main$3, {
            key: 1,
            node: _ctx.node.joinChildren,
            "type-prefix": _ctx.typePrefix,
            viewer: _ctx.viewer,
            "high-light": _ctx.highLight,
            theme: _ctx.theme,
            "dnd-panel": _ctx.dndPanel,
            "can-delete-checker": _ctx.canDeleteChecker,
            onEdit: _cache[7] || (_cache[7] = (n) => _ctx.$emit("edit", n)),
            onDelete: _cache[8] || (_cache[8] = (n) => _ctx.$emit("delete", n)),
            onAdd: _cache[9] || (_cache[9] = (nodeType, parentNode) => _ctx.$emit("add", nodeType, parentNode)),
            onAddBranch: _cache[10] || (_cache[10] = (n) => _ctx.$emit("add-branch", n)),
            onEditBranch: _cache[11] || (_cache[11] = (b) => _ctx.$emit("edit-branch", b)),
            onAddToBranch: _cache[12] || (_cache[12] = (nodeType, b) => _ctx.$emit("add-to-branch", nodeType, b))
          }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "can-delete-checker"])) : vue.createCommentVNode("", true)
        ]);
      };
    }
  });
  const ParallelGroup = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-42441af7"]]);
  const _hoisted_1$3 = { class: "ding-node-chain" };
  const _sfc_main$3 = /* @__PURE__ */ vue.defineComponent({
    __name: "NodeChain",
    props: {
      node: {},
      typePrefix: {},
      viewer: { type: Boolean },
      highLight: {},
      theme: {},
      dndPanel: {},
      protectedIds: { default: () => /* @__PURE__ */ new Set() },
      canDeleteChecker: {},
      depth: { default: 0 }
    },
    emits: ["edit", "delete", "add", "add-branch", "edit-branch", "add-to-branch"],
    setup(__props) {
      const props = __props;
      const protectedIdsComputed = vue.computed(() => props.protectedIds ?? /* @__PURE__ */ new Set());
      const canDeleteCheckerComputed = vue.computed(
        () => props.canDeleteChecker ?? ((_n) => true)
      );
      function canDelete(node) {
        if (protectedIdsComputed.value.has(node.id)) return false;
        if (!canDeleteCheckerComputed.value(node)) return false;
        return true;
      }
      const isCondition = vue.computed(() => isConditionNode(props.node));
      const isFork = vue.computed(() => isForkNode(props.node));
      const baseType = vue.computed(() => {
        if (isCondition.value) return "condition";
        if (isFork.value) return "fork";
        return props.node.type.replace(props.typePrefix, "");
      });
      return (_ctx, _cache) => {
        var _a;
        const _component_NodeChain = vue.resolveComponent("NodeChain", true);
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$3, [
          isFork.value ? (vue.openBlock(), vue.createBlock(ParallelGroup, {
            key: 0,
            node: _ctx.node,
            "type-prefix": _ctx.typePrefix,
            viewer: _ctx.viewer,
            "high-light": _ctx.highLight,
            theme: _ctx.theme,
            "dnd-panel": _ctx.dndPanel,
            "protected-ids": protectedIdsComputed.value,
            "can-delete-checker": canDeleteCheckerComputed.value,
            onEdit: _cache[0] || (_cache[0] = (n) => _ctx.$emit("edit", n)),
            onDelete: _cache[1] || (_cache[1] = (n) => _ctx.$emit("delete", n)),
            onAdd: _cache[2] || (_cache[2] = (nodeType, parentNode) => _ctx.$emit("add", nodeType, parentNode)),
            onAddBranch: _cache[3] || (_cache[3] = (n) => _ctx.$emit("add-branch", n)),
            onEditBranch: _cache[4] || (_cache[4] = (b) => _ctx.$emit("edit-branch", b)),
            onAddToBranch: _cache[5] || (_cache[5] = (nodeType, b) => _ctx.$emit("add-to-branch", nodeType, b))
          }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "protected-ids", "can-delete-checker"])) : isCondition.value ? (vue.openBlock(), vue.createBlock(_sfc_main$5, {
            key: 1,
            node: _ctx.node,
            "type-prefix": _ctx.typePrefix,
            viewer: _ctx.viewer,
            "high-light": _ctx.highLight,
            theme: _ctx.theme,
            "dnd-panel": _ctx.dndPanel,
            "protected-ids": protectedIdsComputed.value,
            "can-delete-checker": canDeleteCheckerComputed.value,
            onEdit: _cache[6] || (_cache[6] = (n) => _ctx.$emit("edit", n)),
            onDelete: _cache[7] || (_cache[7] = (n) => _ctx.$emit("delete", n)),
            onAdd: _cache[8] || (_cache[8] = (nodeType, parentNode) => _ctx.$emit("add", nodeType, parentNode)),
            onAddBranch: _cache[9] || (_cache[9] = (n) => _ctx.$emit("add-branch", n)),
            onEditBranch: _cache[10] || (_cache[10] = (b) => _ctx.$emit("edit-branch", b)),
            onAddToBranch: _cache[11] || (_cache[11] = (nodeType, b) => _ctx.$emit("add-to-branch", nodeType, b))
          }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "protected-ids", "can-delete-checker"])) : (vue.openBlock(), vue.createBlock(_sfc_main$9, {
            key: 2,
            node: _ctx.node,
            "type-prefix": _ctx.typePrefix,
            viewer: _ctx.viewer,
            "high-light": _ctx.highLight,
            theme: _ctx.theme,
            depth: _ctx.depth,
            "can-delete": canDelete(_ctx.node),
            onEdit: _cache[12] || (_cache[12] = (n) => _ctx.$emit("edit", n)),
            onDelete: _cache[13] || (_cache[13] = (n) => _ctx.$emit("delete", n))
          }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "depth", "can-delete"])),
          !isFork.value && baseType.value !== "end" ? (vue.openBlock(), vue.createBlock(_sfc_main$7, {
            key: 3,
            viewer: _ctx.viewer,
            "type-prefix": _ctx.typePrefix,
            "dnd-panel": _ctx.dndPanel,
            readonly: baseType.value === "start",
            "prev-node-id": _ctx.node.id,
            "next-node-id": (_a = _ctx.node.children) == null ? void 0 : _a.id,
            "high-light": _ctx.highLight,
            onAdd: _cache[14] || (_cache[14] = (nodeType) => _ctx.$emit("add", nodeType, _ctx.node))
          }, null, 8, ["viewer", "type-prefix", "dnd-panel", "readonly", "prev-node-id", "next-node-id", "high-light"])) : vue.createCommentVNode("", true),
          !isFork.value && _ctx.node.children ? (vue.openBlock(), vue.createBlock(_component_NodeChain, {
            key: 4,
            node: _ctx.node.children,
            "type-prefix": _ctx.typePrefix,
            viewer: _ctx.viewer,
            "high-light": _ctx.highLight,
            theme: _ctx.theme,
            "dnd-panel": _ctx.dndPanel,
            depth: _ctx.depth + 1,
            "protected-ids": protectedIdsComputed.value,
            "can-delete-checker": canDeleteCheckerComputed.value,
            onEdit: _cache[15] || (_cache[15] = (n) => _ctx.$emit("edit", n)),
            onDelete: _cache[16] || (_cache[16] = (n) => _ctx.$emit("delete", n)),
            onAdd: _cache[17] || (_cache[17] = (nodeType, parentNode) => _ctx.$emit("add", nodeType, parentNode)),
            onAddBranch: _cache[18] || (_cache[18] = (n) => _ctx.$emit("add-branch", n)),
            onEditBranch: _cache[19] || (_cache[19] = (b) => _ctx.$emit("edit-branch", b)),
            onAddToBranch: _cache[20] || (_cache[20] = (nodeType, b) => _ctx.$emit("add-to-branch", nodeType, b))
          }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "depth", "protected-ids", "can-delete-checker"])) : vue.createCommentVNode("", true)
        ]);
      };
    }
  });
  const _hoisted_1$2 = ["title"];
  const _hoisted_2$1 = {
    key: 0,
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    width: "20",
    height: "20"
  };
  const _hoisted_3$1 = {
    key: 1,
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    width: "20",
    height: "20"
  };
  const _hoisted_4 = ["title", "onClick"];
  const _hoisted_5 = { class: "ding-control-panel__text" };
  const _sfc_main$2 = /* @__PURE__ */ vue.defineComponent({
    __name: "ControlPanel",
    props: {
      initControl: {
        type: Boolean,
        default: true
      },
      control: {
        type: Array
      },
      viewer: {
        type: Boolean,
        default: false
      }
    },
    emits: ["save", "clear", "view-data", "import-data", "fullscreen"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const isMobile = vue.ref(false);
      const mobileOpen = vue.ref(false);
      function syncIsMobile() {
        const narrow = typeof window !== "undefined" && window.innerWidth < 768;
        const preview = typeof document !== "undefined" && document.documentElement.classList.contains("is-mobile-preview");
        const next = narrow || preview;
        isMobile.value = next;
        if (!next) mobileOpen.value = false;
      }
      function handleResize() {
        syncIsMobile();
      }
      function toggleMobile() {
        mobileOpen.value = !mobileOpen.value;
      }
      function closeMobile() {
        mobileOpen.value = false;
      }
      function handleClickOutside() {
        if (isMobile.value && mobileOpen.value) closeMobile();
      }
      let mobilePreviewObserver = null;
      vue.onMounted(() => {
        syncIsMobile();
        window.addEventListener("resize", handleResize);
        document.addEventListener("click", handleClickOutside);
        mobilePreviewObserver = new MutationObserver(syncIsMobile);
        mobilePreviewObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"]
        });
      });
      vue.onBeforeUnmount(() => {
        window.removeEventListener("resize", handleResize);
        document.removeEventListener("click", handleClickOutside);
        mobilePreviewObserver == null ? void 0 : mobilePreviewObserver.disconnect();
        mobilePreviewObserver = null;
      });
      const defaultControl = [
        {
          key: "save",
          iconClass: "ding-icon-save",
          title: "保存",
          text: "保存",
          sort: 90
        },
        {
          key: "clear",
          iconClass: "ding-icon-clear",
          title: "清空",
          text: "清空",
          sort: 60
        },
        {
          key: "see",
          iconClass: "ding-icon-see",
          title: "查看数据",
          text: "查看数据",
          sort: 70
        },
        {
          key: "import",
          iconClass: "ding-icon-import",
          title: "导入",
          text: "导入",
          sort: 80
        },
        {
          key: "fullscreen",
          iconClass: "ding-icon-fullscreen",
          title: "全屏",
          text: "全屏",
          sort: 100
        }
      ];
      const mergedItems = vue.computed(() => {
        if (!props.initControl) return props.control || [];
        let items = [...defaultControl];
        if (props.control && props.control.length > 0) {
          for (const ext of props.control) {
            const idx = items.findIndex((d) => d.key === ext.key);
            if (idx >= 0) {
              items[idx] = { ...items[idx], ...ext };
            } else {
              items.push(ext);
            }
          }
        }
        return items;
      });
      const visibleItems = vue.computed(() => {
        let items = mergedItems.value.filter((item) => !item.hide);
        if (props.viewer) {
          items = items.filter((item) => !["save", "clear", "import"].includes(item.key || ""));
        }
        return items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      });
      function handleClick(item) {
        if (isMobile.value) closeMobile();
        if (item.onClick && typeof item.onClick === "function") {
          item.onClick(item);
          return;
        }
        switch (item.key) {
          case "save":
            emit("save");
            break;
          case "clear":
            emit("clear");
            break;
          case "see":
            emit("view-data");
            break;
          case "import":
            emit("import-data");
            break;
          case "fullscreen":
            emit("fullscreen");
            break;
        }
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: vue.normalizeClass(["ding-control-panel", { "is-mobile": isMobile.value, "is-mobile-open": isMobile.value && mobileOpen.value }])
        }, [
          isMobile.value ? (vue.openBlock(), vue.createElementBlock("button", {
            key: 0,
            class: "ding-control-panel__mobile-toggle",
            title: mobileOpen.value ? "收起操作" : "展开操作",
            onClick: vue.withModifiers(toggleMobile, ["stop"])
          }, [
            !mobileOpen.value ? (vue.openBlock(), vue.createElementBlock("svg", _hoisted_2$1, _cache[1] || (_cache[1] = [
              vue.createElementVNode("line", {
                x1: "3",
                y1: "6",
                x2: "21",
                y2: "6"
              }, null, -1),
              vue.createElementVNode("line", {
                x1: "3",
                y1: "12",
                x2: "21",
                y2: "12"
              }, null, -1),
              vue.createElementVNode("line", {
                x1: "3",
                y1: "18",
                x2: "21",
                y2: "18"
              }, null, -1)
            ]))) : (vue.openBlock(), vue.createElementBlock("svg", _hoisted_3$1, _cache[2] || (_cache[2] = [
              vue.createElementVNode("line", {
                x1: "18",
                y1: "6",
                x2: "6",
                y2: "18"
              }, null, -1),
              vue.createElementVNode("line", {
                x1: "6",
                y1: "6",
                x2: "18",
                y2: "18"
              }, null, -1)
            ])))
          ], 8, _hoisted_1$2)) : vue.createCommentVNode("", true),
          visibleItems.value.length > 0 && (!isMobile.value || mobileOpen.value) ? (vue.openBlock(), vue.createElementBlock("div", {
            key: 1,
            class: "ding-control-panel__list",
            onClick: _cache[0] || (_cache[0] = vue.withModifiers(() => {
            }, ["stop"]))
          }, [
            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(visibleItems.value, (item) => {
              return vue.openBlock(), vue.createElementBlock("div", {
                key: item.key,
                class: "ding-control-panel__item",
                title: item.title || item.text,
                onClick: ($event) => handleClick(item)
              }, [
                vue.createElementVNode("span", {
                  class: vue.normalizeClass(["ding-control-panel__icon", item.iconClass])
                }, null, 2),
                vue.createElementVNode("span", _hoisted_5, vue.toDisplayString(item.text), 1)
              ], 8, _hoisted_4);
            }), 128))
          ])) : vue.createCommentVNode("", true)
        ], 2);
      };
    }
  });
  const start = {
    labelWidth: "120px",
    formItems: [{
      name: "name",
      label: "唯一编码",
      component: "Input",
      componentProps: {
        placeholder: "请输入唯一编码"
      }
    }, {
      name: "preInterceptors",
      label: "前置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入前置拦截器"
      }
    }, {
      name: "postInterceptors",
      label: "后置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入后置拦截器"
      }
    }]
  };
  const end = {
    labelWidth: "120px",
    formItems: [{
      name: "name",
      label: "唯一编码",
      component: "Input",
      componentProps: {
        placeholder: "请输入唯一编码"
      }
    }, {
      name: "preInterceptors",
      label: "前置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入前置拦截器"
      }
    }, {
      name: "postInterceptors",
      label: "后置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入后置拦截器"
      }
    }]
  };
  const task = {
    labelWidth: "120px",
    formItems: [
      {
        name: "name",
        label: "唯一编码",
        component: "Input",
        componentProps: {
          placeholder: "请输入唯一编码"
        }
      },
      {
        name: "displayName",
        label: "显示名称",
        component: "Input",
        componentProps: {
          placeholder: "请输入显示名称"
        }
      },
      {
        name: "preInterceptors",
        label: "前置拦截器",
        component: "Input",
        componentProps: {
          placeholder: "请输入前置拦截器"
        }
      },
      {
        name: "postInterceptors",
        label: "后置拦截器",
        component: "Input",
        componentProps: {
          placeholder: "请输入后置拦截器"
        }
      },
      {
        name: "form",
        label: "表单",
        component: "Input",
        componentProps: {
          placeholder: "请输入表单"
        }
      },
      {
        name: "assignee",
        label: "参与人",
        component: "Input",
        componentProps: {
          placeholder: "请输入参与人"
        }
      },
      {
        name: "assignmentHandler",
        label: "参与人处理类",
        component: "Input",
        componentProps: {
          placeholder: "请输入参与人处理类"
        }
      },
      {
        name: "candidateUsers",
        label: "候选用户",
        component: "Input",
        helpMessage: "多个用户用英文逗号分隔",
        componentProps: {
          placeholder: "请输入候选用户（多个用逗号分隔）"
        }
      },
      {
        name: "candidateGroups",
        label: "候选用户组",
        component: "Input",
        helpMessage: "多个用户组用英文逗号分隔",
        componentProps: {
          placeholder: "请输入候选用户组（多个用逗号分隔）"
        }
      },
      {
        name: "candidateHandler",
        label: "候选用户处理类",
        component: "Input",
        componentProps: {
          placeholder: "请输入候选用户处理类"
        }
      },
      {
        name: "taskType",
        label: "任务类型",
        component: "Select",
        componentProps: {
          placeholder: "请选择任务类型",
          options: [
            {
              label: "主办",
              value: "Major"
            },
            {
              label: "协办",
              value: "Aidant"
            }
          ]
        }
      },
      {
        name: "performType",
        label: "参与类型",
        component: "Select",
        componentProps: {
          placeholder: "请选择参与类型",
          options: [
            {
              label: "普通参与",
              value: "ANY"
            },
            {
              label: "会签参与",
              value: "ALL"
            }
          ]
        }
      },
      {
        name: "countersignType",
        label: "会签类型",
        component: "Select",
        defaultValue: "PARALLEL",
        helpMessage: "参与类型为会签参与时生效",
        componentProps: {
          placeholder: "请选择会签类型",
          options: [
            {
              label: "并行会签",
              value: "PARALLEL"
            },
            {
              label: "顺序会签",
              value: "SEQUENTIAL"
            }
          ]
        }
      },
      {
        name: "countersignCompletionCondition",
        label: "会签完成条件",
        component: "Input",
        helpMessage: "参与类型为会签参与时生效，如：nrOfCompletedInstances/nrOfInstances >= 0.6",
        componentProps: {
          placeholder: "请输入会签完成条件"
        }
      },
      {
        name: "actionBtns",
        label: "操作按钮",
        component: "Input",
        helpMessage: [
          "多个按钮用英文逗号分隔，普通参与可选：AGREE(同意)/REJECT(拒绝)/ROLLBACK(退回上一步)/ROLLBACK_TO_OPERATOR(退回发起人)/JUMP(跳转)",
          "会签参与可选：AGREE(同意)/COUNTERSIGN_DISAGREE(会签不同意)/ADD_CANDIDATE(加签)"
        ],
        componentProps: {
          placeholder: "如 AGREE,REJECT,ROLLBACK"
        }
      },
      {
        name: "reminderTime",
        label: "提醒时间",
        component: "Input",
        componentProps: {
          placeholder: "请输入提醒时间"
        }
      },
      {
        name: "reminderRepeat",
        label: "重复提醒间隔",
        component: "Input",
        componentProps: {
          placeholder: "请输入重复提醒间隔"
        }
      },
      {
        name: "expireTime",
        label: "期待完成时间",
        component: "Input",
        componentProps: {
          placeholder: "请输入期待完成时间"
        }
      },
      {
        name: "autoExecute",
        label: "是否自动完成",
        component: "Select",
        componentProps: {
          placeholder: "请选择是否自动完成",
          options: [
            {
              label: "是",
              value: "Y"
            },
            {
              label: "否",
              value: "N"
            }
          ]
        }
      },
      {
        name: "callback",
        label: "回调处理",
        component: "Input",
        componentProps: {
          placeholder: "请输入回调处理"
        }
      }
    ]
  };
  const process = {
    labelWidth: "130px",
    formItems: [{
      name: "name",
      label: "流程定义唯一编码",
      component: "Input",
      componentProps: {
        placeholder: "请输入流程定义唯一编码"
      }
    }, {
      name: "displayName",
      label: "流程定义显示名称",
      component: "Input",
      componentProps: {
        placeholder: "请输入流程定义显示名称"
      }
    }, {
      name: "expireTime",
      label: "期望完成时间",
      component: "Input",
      componentProps: {
        placeholder: "请输入期望完成时间"
      }
    }, {
      name: "instanceUrl",
      label: "实例启动表单",
      component: "Input",
      helpMessage: "如果为元数据表单，数据模型的表名称和流程唯一编码要保持一致",
      componentProps: {
        placeholder: "请输入实例启动表单"
      }
    }, {
      name: "enableFieldPerm",
      label: "启用字段权限",
      component: "Select",
      defaultValue: 0,
      helpMessage: "开启后，可在任务节点配置字段只读/可编辑/不可见",
      componentProps: {
        placeholder: "请选择是否启用字段权限",
        options: [
          {
            label: "否",
            value: 0
          },
          {
            label: "是",
            value: 1
          }
        ]
      }
    }, {
      name: "instanceNoClass",
      label: "实例编号生成类",
      component: "Input",
      componentProps: {
        placeholder: "请输入实例编号生成类"
      }
    }, {
      name: "preInterceptors",
      label: "前置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入前置拦截器"
      }
    }, {
      name: "postInterceptors",
      label: "后置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入后置拦截器"
      }
    }, {
      name: "relTableName",
      label: "关联业务表",
      component: "Input",
      helpMessage: "流程结束后业务数据落库的目标表；为空时使用流程唯一编码",
      componentProps: {
        placeholder: "如 biz_leave"
      }
    }, {
      name: "persistMode",
      label: "持久化模式",
      component: "Select",
      defaultValue: "ARCHIVE",
      helpMessage: "ARCHIVE=结束归档（默认）；SYNC=同步演进（发起写入、节点更新、结束定稿）。需配合后置拦截器 PersistPostInterceptor 使用",
      componentProps: {
        placeholder: "请选择持久化模式",
        options: [
          {
            label: "归档",
            value: "ARCHIVE"
          },
          {
            label: "同步",
            value: "SYNC"
          }
        ]
      }
    }, {
      name: "selectUserOnInitiate",
      label: "是否发起时选人",
      component: "Select",
      defaultValue: 0,
      componentProps: {
        placeholder: "请选择是否发起时选人",
        options: [
          {
            label: "否",
            value: 0
          },
          {
            label: "是",
            value: 1
          }
        ]
      }
    }, {
      name: "selectUserApi",
      label: "选人接口地址",
      component: "Input",
      helpMessage: '发起时选人为"是"时生效；目前仅支持POST请求，和通用下拉接口规范一致',
      componentProps: {
        placeholder: "请输入选人接口地址"
      }
    }, {
      name: "enableCcActors",
      label: "启用抄送人",
      component: "Select",
      defaultValue: 0,
      componentProps: {
        placeholder: "请选择是否启用抄送人",
        options: [
          {
            label: "否",
            value: 0
          },
          {
            label: "是",
            value: 1
          }
        ]
      }
    }, {
      name: "enableApplyReason",
      label: "启用申请理由",
      component: "Select",
      defaultValue: 0,
      componentProps: {
        placeholder: "请选择是否启用申请理由",
        options: [
          {
            label: "否",
            value: 0
          },
          {
            label: "是",
            value: 1
          }
        ]
      }
    }, {
      name: "enableAttachment",
      label: "启用附件",
      component: "Select",
      defaultValue: 0,
      componentProps: {
        placeholder: "请选择是否启用附件",
        options: [
          {
            label: "否",
            value: 0
          },
          {
            label: "是",
            value: 1
          }
        ]
      }
    }]
  };
  const subProcess = {
    labelWidth: "130px",
    formItems: [{
      name: "name",
      label: "流程定义唯一编码",
      component: "Input",
      componentProps: {
        placeholder: "请输入流程定义唯一编码"
      }
    }, {
      name: "displayName",
      label: "流程定义显示名称",
      component: "Input",
      componentProps: {
        placeholder: "请输入流程定义显示名称"
      }
    }, {
      name: "form",
      label: "表单",
      component: "Input",
      componentProps: {
        placeholder: "请输入表单"
      }
    }, {
      name: "version",
      label: "版本号",
      component: "Input",
      componentProps: {
        placeholder: "请输入版本号"
      }
    }]
  };
  const decision = {
    labelWidth: "120px",
    formItems: [{
      name: "name",
      label: "唯一编码",
      component: "Input",
      componentProps: {
        placeholder: "请输入唯一编码"
      }
    }, {
      name: "expr",
      label: "决策表达式",
      component: "Input",
      componentProps: {
        placeholder: "请输入决策表达式"
      }
    }, {
      name: "handleClass",
      label: "处理类",
      component: "Input",
      componentProps: {
        placeholder: "请输入处理类"
      }
    }, {
      name: "clazz",
      label: "类路径",
      component: "Input",
      componentProps: {
        placeholder: "请输入类路径"
      }
    }, {
      name: "methodName",
      label: "方法名",
      component: "Input",
      componentProps: {
        placeholder: "请输入方法名"
      }
    }, {
      name: "args",
      label: "参数变量",
      component: "Input",
      componentProps: {
        placeholder: "请输入参数变量"
      }
    }, {
      name: "preInterceptors",
      label: "前置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入前置拦截器"
      }
    }, {
      name: "postInterceptors",
      label: "后置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入后置拦截器"
      }
    }]
  };
  const custom = {
    labelWidth: "120px",
    formItems: [{
      name: "name",
      label: "唯一编码",
      component: "Input",
      componentProps: {
        placeholder: "请输入唯一编码"
      }
    }, {
      name: "displayName",
      label: "显示名称",
      component: "Input",
      componentProps: {
        placeholder: "请输入显示名称"
      }
    }, {
      name: "clazz",
      label: "类路径",
      component: "Input",
      componentProps: {
        placeholder: "请输入类路径"
      }
    }, {
      name: "methodName",
      label: "方法名",
      component: "Input",
      componentProps: {
        placeholder: "请输入方法名"
      }
    }, {
      name: "args",
      label: "参数变量",
      component: "Input",
      componentProps: {
        placeholder: "请输入参数变量"
      }
    }, {
      name: "preInterceptors",
      label: "前置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入前置拦截器"
      }
    }, {
      name: "postInterceptors",
      label: "后置拦截器",
      component: "Input",
      componentProps: {
        placeholder: "请输入后置拦截器"
      }
    }]
  };
  const _hoisted_1$1 = {
    key: 1,
    class: "ding-empty"
  };
  const _hoisted_2 = { class: "ding-modal__json" };
  const _hoisted_3 = {
    key: 0,
    class: "ding-modal__error"
  };
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "DingTalkDesigner",
    props: {
      value: {
        type: Object,
        default: () => ({})
      },
      theme: {
        type: Object,
        default: () => ({})
      },
      highLight: {
        type: Object,
        default: () => ({})
      },
      viewer: {
        type: Boolean,
        default: false
      },
      dndPanel: {
        type: Array,
        default: () => []
      },
      processForm: {
        type: Object
      },
      edgeForm: {
        type: Object
      },
      nodeClick: {
        type: Function
      },
      edgeClick: {
        type: Function
      },
      blankContextmenu: {
        type: Function
      },
      initControl: {
        type: Boolean,
        default: true
      },
      control: {
        type: Array
      },
      drawerWidth: {
        type: [String, Number],
        default: "600px"
      },
      modalWidth: {
        type: [String, Number],
        default: "60%"
      },
      typePrefix: {
        type: String,
        default: "snaker:"
      },
      defaultEdgeType: {
        type: String,
        default: "snaker:transition"
      }
    },
    emits: ["update:value", "node-click", "edge-click", "edit-branch", "save", "on-init", "on-render"],
    setup(__props, { expose: __expose, emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const defaultDndPanelItems = [
        { type: "task", text: "审批人", label: "审批人" },
        { type: "custom", text: "自定义节点", label: "自定义节点" },
        { type: "subProcess", text: "子流程", label: "子流程" }
      ];
      const computedDndPanel = vue.computed(() => {
        const custom2 = props.dndPanel || [];
        const merged = [...defaultDndPanelItems];
        for (const item of custom2) {
          const idx = merged.findIndex((m) => {
            var _a;
            return m.type === item.type || m.type === ((_a = item.type) == null ? void 0 : _a.replace(props.typePrefix, ""));
          });
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...item };
          } else {
            merged.push(item);
          }
        }
        return merged;
      });
      const treeData = vue.ref(void 0);
      const protectedIds = vue.computed(() => {
        const ids = /* @__PURE__ */ new Set();
        if (!treeData.value) return ids;
        const baseType = treeData.value.type.replace(props.typePrefix, "");
        if (baseType === "start") ids.add(treeData.value.id);
        const firstChild = treeData.value.children;
        if (firstChild) ids.add(firstChild.id);
        const endId = findEndNodeId(treeData.value);
        if (endId) ids.add(endId);
        return ids;
      });
      function findEndNodeId(node) {
        if (!node) return null;
        const baseType = node.type.replace(props.typePrefix, "");
        if (baseType === "end") return node.id;
        if (isConditionNode(node)) {
          for (const branch of node.branches) {
            if (branch.children) {
              const id = findEndNodeId(branch.children);
              if (id) return id;
            }
          }
        }
        if (isForkNode(node)) {
          for (const branch of node.branches) {
            if (branch.children) {
              const id = findEndNodeId(branch.children);
              if (id) return id;
            }
          }
          if (node.joinChildren) {
            const id = findEndNodeId(node.joinChildren);
            if (id) return id;
          }
        }
        if ("children" in node && node.children) {
          return findEndNodeId(node.children);
        }
        return null;
      }
      const editingBranchType = vue.ref(null);
      let isInternalUpdate = false;
      const transform = vue.reactive({ scale: 1, x: 0, y: 0 });
      const isDragging = vue.ref(false);
      const dragStart = { x: 0, y: 0, originX: 0, originY: 0 };
      const canvasRef = vue.ref(null);
      const isTouchDragging = vue.ref(false);
      const isPinching = vue.ref(false);
      const touchStart = {
        // 单指 pan
        x: 0,
        y: 0,
        originX: 0,
        originY: 0,
        // 双指 pinch
        distance: 0,
        centerX: 0,
        centerY: 0,
        originScale: 1
      };
      const computedControlItems = vue.computed(() => {
        const ext = props.control || [];
        const zoomItems = [
          { key: "ding-zoom-out", iconClass: "ding-icon-zoom-out", title: "缩小流程图", text: "缩小", sort: 10, onClick: zoomOut },
          { key: "ding-zoom-in", iconClass: "ding-icon-zoom-in", title: "放大流程图", text: "放大", sort: 20, onClick: zoomIn },
          { key: "ding-fit", iconClass: "ding-icon-fit", title: "恢复初始位置和尺寸", text: "适应", sort: 30, onClick: resetView }
        ];
        const merged = [...zoomItems];
        for (const e of ext) {
          const idx = merged.findIndex((m) => m.key === e.key);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...e };
          else merged.push(e);
        }
        return merged.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      });
      const viewportStyle = vue.computed(() => ({
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: "0 0"
      }));
      function zoomIn() {
        zoomBy(1.1);
      }
      function zoomOut() {
        zoomBy(1 / 1.1);
      }
      function zoomBy(factor) {
        const next = Math.min(2, Math.max(0.3, transform.scale * factor));
        const canvas = canvasRef.value;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          transform.x = cx - (cx - transform.x) * (next / transform.scale);
          transform.y = cy - (cy - transform.y) * (next / transform.scale);
        }
        transform.scale = next;
      }
      function resetView() {
        transform.scale = 1;
        transform.x = 0;
        transform.y = 0;
      }
      function handleWheel(e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const canvas = canvasRef.value;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const next = Math.min(2, Math.max(0.3, transform.scale * factor));
          transform.x = px - (px - transform.x) * (next / transform.scale);
          transform.y = py - (py - transform.y) * (next / transform.scale);
          transform.scale = next;
        }
      }
      function handleCanvasMouseDown(e) {
        if (e.button !== 0 && e.button !== 1) return;
        const target = e.target;
        if (target.closest(".ding-node-card, button, .ding-edit-panel, .ding-modal, .ding-designer__zoom-controls, .ding-branch-col__head, .ding-condition-group__title, .ding-add-button")) {
          return;
        }
        startDrag(e);
      }
      function handleViewportMouseDown(e) {
        if (e.button !== 0 && e.button !== 1) return;
        const target = e.target;
        if (target.closest(".ding-node-card, button, .ding-edit-panel, .ding-modal, .ding-designer__zoom-controls, .ding-branch-col__head, .ding-condition-group__title, .ding-add-button")) {
          return;
        }
        startDrag(e);
      }
      function startDrag(e) {
        isDragging.value = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        dragStart.originX = transform.x;
        dragStart.originY = transform.y;
        document.addEventListener("mousemove", handleDocumentMouseMove);
        document.addEventListener("mouseup", handleDocumentMouseUp);
      }
      function handleDocumentMouseMove(e) {
        if (!isDragging.value) return;
        transform.x = dragStart.originX + (e.clientX - dragStart.x);
        transform.y = dragStart.originY + (e.clientY - dragStart.y);
      }
      function handleDocumentMouseUp() {
        isDragging.value = false;
        document.removeEventListener("mousemove", handleDocumentMouseMove);
        document.removeEventListener("mouseup", handleDocumentMouseUp);
      }
      function shouldIgnoreTouchStart(target) {
        const el = target;
        if (!el) return false;
        return !!el.closest(".ding-node-card, button, .ding-edit-panel, .ding-modal, .ding-designer__zoom-controls, .ding-branch-col__head, .ding-condition-group__title, .ding-add-button");
      }
      function getTouchDistance(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.hypot(dx, dy);
      }
      function getTouchCenter(t1, t2) {
        return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      }
      function handleTouchStart(e) {
        if (shouldIgnoreTouchStart(e.target)) return;
        if (e.touches.length === 1) {
          const t = e.touches[0];
          isTouchDragging.value = true;
          touchStart.x = t.clientX;
          touchStart.y = t.clientY;
          touchStart.originX = transform.x;
          touchStart.originY = transform.y;
        } else if (e.touches.length === 2) {
          const [t1, t2] = [e.touches[0], e.touches[1]];
          isPinching.value = true;
          isTouchDragging.value = false;
          touchStart.distance = getTouchDistance(t1, t2);
          touchStart.originScale = transform.scale;
          const center = getTouchCenter(t1, t2);
          touchStart.centerX = center.x;
          touchStart.centerY = center.y;
        }
      }
      function handleTouchMove(e) {
        if (e.touches.length === 2 && isPinching.value) {
          const [t1, t2] = [e.touches[0], e.touches[1]];
          const dist = getTouchDistance(t1, t2);
          if (touchStart.distance > 0) {
            const factor = dist / touchStart.distance;
            const next = Math.min(2, Math.max(0.3, touchStart.originScale * factor));
            const canvas = canvasRef.value;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const px = touchStart.centerX - rect.left;
              const py = touchStart.centerY - rect.top;
              transform.x = px - (px - transform.x) * (next / transform.scale);
              transform.y = py - (py - transform.y) * (next / transform.scale);
              transform.scale = next;
            }
          }
          return;
        }
        if (e.touches.length === 1 && isTouchDragging.value) {
          const t = e.touches[0];
          transform.x = touchStart.originX + (t.clientX - touchStart.x);
          transform.y = touchStart.originY + (t.clientY - touchStart.y);
        }
      }
      function handleTouchEnd(e) {
        if (e.touches.length === 0) {
          isTouchDragging.value = false;
          isPinching.value = false;
        } else if (e.touches.length === 1 && isPinching.value) {
          const t = e.touches[0];
          isPinching.value = false;
          isTouchDragging.value = true;
          touchStart.x = t.clientX;
          touchStart.y = t.clientY;
          touchStart.originX = transform.x;
          touchStart.originY = transform.y;
        }
      }
      vue.onBeforeUnmount(() => {
        document.removeEventListener("mousemove", handleDocumentMouseMove);
        document.removeEventListener("mouseup", handleDocumentMouseUp);
      });
      function findBranchParentType(node, branchId) {
        if (isConditionNode(node)) {
          if (node.branches.some((b) => b.id === branchId)) {
            return "condition";
          }
          for (const branch of node.branches) {
            if (branch.children) {
              const found = findBranchParentType(branch.children, branchId);
              if (found) return found;
            }
          }
        }
        if (isForkNode(node)) {
          if (node.branches.some((b) => b.id === branchId)) {
            return "fork";
          }
          for (const branch of node.branches) {
            if (branch.children) {
              const found = findBranchParentType(branch.children, branchId);
              if (found) return found;
            }
          }
        }
        if (node.children) {
          return findBranchParentType(node.children, branchId);
        }
        return null;
      }
      let defaultFlowInitialized = false;
      function convertToTree() {
        var _a, _b;
        const nodes = ((_a = props.value) == null ? void 0 : _a.nodes) || [];
        const edges = ((_b = props.value) == null ? void 0 : _b.edges) || [];
        const tree = graphToTree(nodes, edges, props.typePrefix);
        if (tree) {
          treeData.value = tree;
        } else if (!props.viewer && !defaultFlowInitialized) {
          defaultFlowInitialized = true;
          initDefaultFlow();
        }
      }
      function initDefaultFlow() {
        treeData.value = graphToTree(DEFAULT_FLOW_NODES, DEFAULT_FLOW_EDGES, props.typePrefix);
      }
      function syncToGraph() {
        const graphData = treeToGraph(treeData.value, props.typePrefix);
        const newValue = {
          ...props.value,
          nodes: graphData.nodes,
          edges: graphData.edges,
          mode: "dingtalk"
        };
        isInternalUpdate = true;
        emit("update:value", newValue);
        eventCenter.emit("update:graphData", newValue);
      }
      const eventHandlers = vue.reactive({});
      const eventCenter = {
        emit(event, data) {
          const handlers = eventHandlers[event] || [];
          handlers.forEach((h) => h(data));
        },
        on(event, handler) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(handler);
        },
        off(event, handler) {
          const handlers = eventHandlers[event] || [];
          const idx = handlers.indexOf(handler);
          if (idx >= 0) handlers.splice(idx, 1);
        }
      };
      convertToTree();
      function normalizeNodeType(rawType) {
        const prefix = props.typePrefix;
        if (rawType === "condition") return `${prefix}decision`;
        if (rawType === "fork") return `${prefix}fork`;
        if (rawType === "join") return `${prefix}join`;
        if (rawType.startsWith(prefix)) return rawType;
        return `${prefix}${rawType}`;
      }
      function nodeToFDData(node) {
        return {
          id: node.id,
          type: normalizeNodeType(node.type),
          text: { value: node.name },
          properties: node.properties || {}
        };
      }
      function findByIdOrName(idOrName) {
        return findNode(
          treeData.value,
          (n) => {
            var _a;
            return n.id === idOrName || ((_a = n.properties) == null ? void 0 : _a.name) === idOrName;
          }
        );
      }
      function _resolveNode(id, allowFallback) {
        if (!treeData.value) return null;
        const found = findByIdOrName(id);
        if (found) return found;
        {
          return findNode(treeData.value, (n) => {
            var _a;
            return ((_a = n.properties) == null ? void 0 : _a.name) === id;
          });
        }
      }
      const designerApi = {
        // ── 查询 ──
        getNodeDataById(id) {
          if (props.viewer) return null;
          const n = findNode(treeData.value, (x) => x.id === id);
          return n ? nodeToFDData(n) : null;
        },
        getNodeDataByName(name) {
          if (props.viewer) return null;
          const n = findNode(treeData.value, (x) => {
            var _a;
            return ((_a = x.properties) == null ? void 0 : _a.name) === name;
          });
          return n ? nodeToFDData(n) : null;
        },
        getAllNodes() {
          return flattenNodes(treeData.value).map(nodeToFDData);
        },
        getProperties(id) {
          const n = _resolveNode(id);
          return n ? { ...n.properties } : {};
        },
        // ── 更新 ──
        updateText(id, text) {
          const n = _resolveNode(id);
          if (n) n.name = text;
          syncToGraph();
        },
        changeNodeId(oldId, newId) {
          if (props.viewer) return false;
          const n = findNode(treeData.value, (x) => x.id === oldId);
          if (!n) return false;
          n.id = newId;
          n.properties = { ...n.properties, name: newId };
          syncToGraph();
          return true;
        },
        setProperties(id, props2) {
          if (props2.viewer) return;
          const n = _resolveNode(id);
          if (n) n.properties = { ...n.properties, ...props2 };
          syncToGraph();
        },
        deleteProperty(id, key) {
          if (props.viewer) return;
          const n = _resolveNode(id);
          if (n && n.properties && key in n.properties) {
            const next = { ...n.properties };
            delete next[key];
            n.properties = next;
          }
          syncToGraph();
        },
        // ── 流程属性（v-model.value） ──
        setProcessProperty(key, value) {
          if (props.viewer) return;
          const newValue = { ...props.value, [key]: value };
          isInternalUpdate = true;
          emit("update:value", newValue);
          eventCenter.emit("update:graphModel", newValue);
        },
        // ── 导出/重渲染 ──
        getGraphData() {
          const graphData = treeToGraph(treeData.value, props.typePrefix);
          return {
            ...props.value,
            nodes: graphData.nodes,
            edges: graphData.edges,
            mode: "dingtalk"
          };
        },
        render(data) {
          isInternalUpdate = true;
          treeData.value = graphToTree((data == null ? void 0 : data.nodes) || [], (data == null ? void 0 : data.edges) || [], props.typePrefix);
          isInternalUpdate = false;
          syncToGraph();
          eventCenter.emit("update:graphData", data);
        },
        // ── 高亮 ──
        setHighlight(data) {
          eventCenter.emit("update:highlight", data);
        },
        // ── 事件总线 ──
        eventCenter,
        // ── graphModel 代理（与画布模式 lf.graphModel 兼容） ──
        // 业务方 vben5 process-drawer.vue 的写法：
        //   lfInstance.graphModel[key] = value
        //   lfInstance.graphModel.eventCenter.emit('update:graphModel', graphModel)
        // 在钉钉模式无需任何修改也能跑通
        graphModel: makeGraphModelProxy()
      };
      let _graphModelDraft = {};
      vue.watch(() => props.value, () => {
        if (!isInternalUpdate) {
          _graphModelDraft = {};
        }
      });
      function makeGraphModelProxy() {
        return new Proxy({}, {
          get(_target, key) {
            var _a;
            if (key === "eventCenter") return eventCenter;
            if (key in _graphModelDraft) return _graphModelDraft[key];
            return (_a = props.value) == null ? void 0 : _a[key];
          },
          set(_target, key, value) {
            if (props.viewer) return true;
            _graphModelDraft[key] = value;
            const newValue = { ...props.value, ..._graphModelDraft };
            isInternalUpdate = true;
            emit("update:value", newValue);
            eventCenter.emit("update:graphModel", newValue);
            return true;
          },
          has(_target, key) {
            return key === "eventCenter" || key in _graphModelDraft || key in (props.value || {});
          }
        });
      }
      __expose(designerApi);
      vue.onMounted(() => {
        emit("on-init", designerApi);
        emit("on-render", designerApi);
      });
      vue.watch(() => props.value, () => {
        if (isInternalUpdate) {
          isInternalUpdate = false;
          return;
        }
        convertToTree();
      }, { deep: true });
      const containerStyle = vue.computed(() => {
        var _a, _b, _c, _d;
        const style = {};
        if ((_a = props.theme) == null ? void 0 : _a.backgroundColor) {
          style["--ding-bg-color"] = props.theme.backgroundColor;
        }
        if ((_b = props.theme) == null ? void 0 : _b.primaryColor) {
          style["--ding-primary-color"] = props.theme.primaryColor;
        }
        if ((_c = props.theme) == null ? void 0 : _c.activeColor) {
          style["--ding-active-color"] = props.theme.activeColor;
        }
        if ((_d = props.theme) == null ? void 0 : _d.historyColor) {
          style["--ding-history-color"] = props.theme.historyColor;
        }
        return style;
      });
      let idCounter = 0;
      function generateId() {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          return `ding_${crypto.randomUUID()}`;
        }
        return `ding_${Date.now()}_${++idCounter}`;
      }
      function ensureTypePrefix(type) {
        if (!type) return type;
        if (type.startsWith(props.typePrefix)) return type;
        return `${props.typePrefix}${type}`;
      }
      function handleAddNode(nodeType, afterNode) {
        if (!treeData.value) return;
        if (nodeType === "__condition__") {
          insertConditionNode(afterNode);
          syncToGraph();
          return;
        }
        if (nodeType === "__parallel__") {
          insertForkJoinPair(afterNode);
          syncToGraph();
          return;
        }
        const fullType = ensureTypePrefix(nodeType);
        const newNode = {
          id: generateId(),
          type: fullType,
          name: getDefaultName(fullType),
          properties: {}
        };
        if (afterNode) {
          insertAfter(treeData.value, afterNode.id, newNode);
        }
        syncToGraph();
      }
      function canDeleteNode(node) {
        if (!treeData.value) return true;
        if (protectedIds.value.has(node.id)) return false;
        if (willEmptyBranch(treeData.value, node.id)) return false;
        return true;
      }
      function handleDeleteNode(node) {
        if (!treeData.value) return;
        const baseType = node.type.replace(props.typePrefix, "");
        if (protectedIds.value.has(node.id)) {
          console.warn("[DingTalkDesigner] 受保护节点不允许删除：", node.id);
          return;
        }
        if (baseType === "start" || baseType === "end") return;
        if (willEmptyBranch(treeData.value, node.id)) {
          console.warn("[DingTalkDesigner] 分支只有 2 条，不允许删除会让分支变空的任务：", node.id);
          return;
        }
        if (isConditionNode(node)) {
          removeConditionContainerById(treeData.value, node.id);
        } else if (isForkNode(node)) {
          removeForkContainerById(treeData.value, node.id);
        } else {
          removeNode(treeData.value, node.id);
        }
        cleanupEmptyBranches(treeData.value);
        syncToGraph();
      }
      function willEmptyBranch(root, targetId) {
        function check(node) {
          if (isConditionNode(node)) {
            const cond = node;
            if (cond.branches.length === 2) {
              for (const branch of cond.branches) {
                if (branch.children && branch.children.id === targetId && !branch.children.children) {
                  return true;
                }
              }
            }
            for (const b of cond.branches) {
              if (b.children && check(b.children)) return true;
            }
          }
          if (isForkNode(node)) {
            const fork = node;
            if (fork.branches.length === 2) {
              for (const branch of fork.branches) {
                if (branch.children && branch.children.id === targetId && !branch.children.children) {
                  return true;
                }
              }
            }
            for (const b of fork.branches) {
              if (b.children && check(b.children)) return true;
            }
            if (fork.joinChildren && check(fork.joinChildren)) return true;
          }
          if (node.children) return check(node.children);
          return false;
        }
        return check(root);
      }
      function handleEditNode(node) {
        var _a, _b;
        if (props.viewer) return;
        const baseType = node.type.replace(props.typePrefix, "");
        const matchedPatternItem = computedDndPanel.value.find(
          (item) => item.type === baseType || item.type === node.type
        );
        const eventParams = {
          data: nodeToFDData(node),
          node,
          patternItem: matchedPatternItem,
          lf: designerApi
        };
        if ((matchedPatternItem == null ? void 0 : matchedPatternItem.nodeClick) && typeof matchedPatternItem.nodeClick === "function") {
          matchedPatternItem.nodeClick(eventParams);
          return;
        }
        if (props.nodeClick && typeof props.nodeClick === "function") {
          props.nodeClick(eventParams);
          return;
        }
        editingBranch.value = null;
        editingNode.value = node;
        editingPatternForm.value = matchedPatternItem == null ? void 0 : matchedPatternItem.form;
        editFormData.name = ((_a = node.properties) == null ? void 0 : _a.name) || node.id;
        editFormData.displayName = node.name || "";
        for (const f of editFormFields.value) {
          if (f.name === "name" || f.name === "displayName") continue;
          editFormData[f.name] = ((_b = node.properties) == null ? void 0 : _b[f.name]) ?? f.defaultValue ?? "";
        }
        emit("node-click", eventParams);
      }
      function handleEditBranch(branch) {
        var _a, _b;
        if (props.viewer) return;
        const eventParams = {
          data: {
            id: branch.id,
            type: "transition",
            text: { value: branch.name },
            properties: branch.properties || {}
          },
          edge: branch,
          patternItem: { form: props.edgeForm },
          lf: designerApi
        };
        if (props.edgeClick && typeof props.edgeClick === "function") {
          props.edgeClick(eventParams);
          return;
        }
        editingNode.value = null;
        editingBranch.value = branch;
        editingBranchType.value = treeData.value ? findBranchParentType(treeData.value, branch.id) : null;
        editFormData.displayName = branch.name || "";
        editFormData.expr = ((_a = branch.properties) == null ? void 0 : _a.expr) || "";
        editFormData.name = ((_b = branch.properties) == null ? void 0 : _b.name) || branch.id;
        emit("edge-click", eventParams);
      }
      function handleAddBranch(node) {
        const taskType = ensureTypePrefix("task");
        const branchTask = {
          id: generateId(),
          type: taskType,
          name: getDefaultName(taskType),
          properties: {}
        };
        if (isConditionNode(node)) {
          const condNode = node;
          const newBranch = {
            id: generateId(),
            name: `条件${condNode.branches.length + 1}`,
            properties: {},
            children: branchTask
          };
          condNode.branches.push(newBranch);
          syncToGraph();
          return;
        }
        if (isForkNode(node)) {
          const forkNode = node;
          const newBranch = {
            id: generateId(),
            name: `分支${forkNode.branches.length + 1}`,
            properties: {},
            children: branchTask
          };
          forkNode.branches.push(newBranch);
          syncToGraph();
        }
      }
      function handleAddToBranch(nodeType, branch) {
        if (!treeData.value) return;
        if (nodeType === "__condition__") {
          const condNode = {
            id: generateId(),
            type: "condition",
            name: "",
            properties: {},
            branches: [
              { id: generateId(), name: "条件1", properties: {} },
              { id: generateId(), name: "条件2", properties: {} }
            ]
          };
          branch.children = condNode;
          syncToGraph();
          return;
        }
        const fullType = ensureTypePrefix(nodeType);
        const newNode = {
          id: generateId(),
          type: fullType,
          name: getDefaultName(fullType),
          properties: {}
        };
        branch.children = newNode;
        syncToGraph();
      }
      function insertAfter(root, targetId, newNode) {
        if (root.id === targetId) {
          newNode.children = root.children;
          root.children = newNode;
          return true;
        }
        if (isConditionNode(root)) {
          const condNode = root;
          for (const branch of condNode.branches) {
            if (branch.children && insertAfter(branch.children, targetId, newNode)) {
              return true;
            }
          }
        }
        if (isForkNode(root)) {
          const forkNode = root;
          for (const branch of forkNode.branches) {
            if (branch.children && insertAfter(branch.children, targetId, newNode)) {
              return true;
            }
          }
          if (forkNode.joinChildren && insertAfter(forkNode.joinChildren, targetId, newNode)) {
            return true;
          }
        }
        if (root.children) {
          return insertAfter(root.children, targetId, newNode);
        }
        return false;
      }
      function removeNode(root, targetId) {
        if (root.children && root.children.id === targetId) {
          const target = root.children;
          root.children = target.children;
          return true;
        }
        if (isConditionNode(root)) {
          const condNode = root;
          for (const branch of condNode.branches) {
            if (branch.children) {
              if (branch.children.id === targetId) {
                const target = branch.children;
                branch.children = target.children;
                return true;
              }
              if (removeNode(branch.children, targetId)) {
                return true;
              }
            }
          }
        }
        if (isForkNode(root)) {
          const forkNode = root;
          for (const branch of forkNode.branches) {
            if (branch.children) {
              if (branch.children.id === targetId) {
                branch.children = branch.children.children;
                return true;
              }
              if (removeNode(branch.children, targetId)) {
                return true;
              }
            }
          }
          if (forkNode.joinChildren) {
            if (forkNode.joinChildren.id === targetId) {
              forkNode.joinChildren = forkNode.joinChildren.children || void 0;
              return true;
            }
            if (removeNode(forkNode.joinChildren, targetId)) {
              return true;
            }
          }
        }
        if (root.children) {
          return removeNode(root.children, targetId);
        }
        return false;
      }
      function cleanupEmptyBranches(root) {
        if (!root) return;
        function walk(node) {
          if (isConditionNode(node)) {
            const cond = node;
            if (cond.branches.length > 2) {
              cond.branches = cond.branches.filter((b) => b.children !== void 0);
            }
            for (const b of cond.branches) {
              if (b.children) walk(b.children);
            }
          } else if (isForkNode(node)) {
            const fork = node;
            if (fork.branches.length > 2) {
              fork.branches = fork.branches.filter((b) => b.children !== void 0);
            }
            for (const b of fork.branches) {
              if (b.children) walk(b.children);
            }
            if (fork.joinChildren) walk(fork.joinChildren);
          } else if (node.children) {
            walk(node.children);
          }
        }
        walk(root);
      }
      function removeConditionContainerById(root, containerId) {
        if (root.children && root.children.id === containerId && isConditionNode(root.children)) {
          root.children = root.children.children;
          return true;
        }
        if (isConditionNode(root)) {
          const condNode = root;
          for (const branch of condNode.branches) {
            if (branch.children && branch.children.id === containerId && isConditionNode(branch.children)) {
              branch.children = branch.children.children;
              return true;
            }
            if (branch.children && removeConditionContainerById(branch.children, containerId)) {
              return true;
            }
          }
        }
        if (isForkNode(root)) {
          const forkNode = root;
          for (const branch of forkNode.branches) {
            if (branch.children && removeConditionContainerById(branch.children, containerId)) {
              return true;
            }
          }
          if (forkNode.joinChildren && removeConditionContainerById(forkNode.joinChildren, containerId)) {
            return true;
          }
        }
        if (root.children) {
          return removeConditionContainerById(root.children, containerId);
        }
        return false;
      }
      function removeForkContainerById(root, containerId) {
        var _a;
        if (root.children && root.children.id === containerId && isForkNode(root.children)) {
          root.children = (_a = root.children.joinChildren) == null ? void 0 : _a.children;
          return true;
        }
        if (isForkNode(root)) {
          const forkNode = root;
          for (const branch of forkNode.branches) {
            if (branch.children && removeForkContainerById(branch.children, containerId)) {
              return true;
            }
          }
          if (forkNode.joinChildren && removeForkContainerById(forkNode.joinChildren, containerId)) {
            return true;
          }
        }
        if (root.children) {
          return removeForkContainerById(root.children, containerId);
        }
        return false;
      }
      function insertConditionNode(afterNode) {
        if (!treeData.value || !afterNode) return;
        const taskType = ensureTypePrefix("task");
        const branch1Task = {
          id: generateId(),
          type: taskType,
          name: getDefaultName(taskType),
          properties: {}
        };
        const branch2Task = {
          id: generateId(),
          type: taskType,
          name: getDefaultName(taskType),
          properties: {}
        };
        const condNode = {
          id: generateId(),
          type: "condition",
          name: "",
          properties: {},
          branches: [
            { id: generateId(), name: "条件1", properties: {}, children: branch1Task },
            { id: generateId(), name: "条件2", properties: {}, children: branch2Task }
          ]
        };
        insertAfter(treeData.value, afterNode.id, condNode);
      }
      function insertForkJoinPair(afterNode) {
        if (!treeData.value || !afterNode) return;
        const joinId = generateId();
        const joinNode = {
          id: joinId,
          type: ensureTypePrefix("join"),
          name: "合并节点",
          properties: {},
          children: afterNode.children
          // 接管原 afterNode.children
        };
        const taskType = ensureTypePrefix("task");
        const branch1Task = {
          id: generateId(),
          type: taskType,
          name: getDefaultName(taskType),
          properties: {}
        };
        const branch2Task = {
          id: generateId(),
          type: taskType,
          name: getDefaultName(taskType),
          properties: {}
        };
        const forkNode = {
          id: generateId(),
          type: "fork",
          name: "",
          properties: {},
          branches: [
            { id: generateId(), name: "分支1", properties: {}, children: branch1Task },
            { id: generateId(), name: "分支2", properties: {}, children: branch2Task }
          ],
          joinId,
          joinChildren: joinNode
        };
        afterNode.children = forkNode;
      }
      function getDefaultName(nodeType) {
        const baseType = nodeType.replace(props.typePrefix, "");
        switch (baseType) {
          case "task":
            return "审批人";
          case "custom":
            return "自定义节点";
          case "subProcess":
            return "子流程";
          default:
            return "新节点";
        }
      }
      const editingNode = vue.ref(null);
      const editingBranch = vue.ref(null);
      const showEditPanel = vue.computed(() => !!editingNode.value || !!editingBranch.value);
      const editFormData = vue.reactive({
        name: "",
        displayName: "",
        assignee: "",
        assignmentHandler: "",
        candidateUsers: "",
        candidateGroups: "",
        candidateHandler: "",
        taskType: "",
        performType: "",
        countersignType: "",
        countersignCompletionCondition: "",
        actionBtns: "",
        callback: "",
        reminderTime: "",
        reminderRepeat: "",
        expireTime: "",
        autoExecute: "",
        clazz: "",
        methodName: "",
        args: "",
        form: "",
        version: "",
        preInterceptors: "",
        postInterceptors: "",
        expr: "",
        handleClass: ""
      });
      const editPanelTitle = vue.computed(() => {
        if (editingBranch.value) return "编辑分支条件";
        if (!editingNode.value) return "";
        const baseType = editingNode.value.type.replace(props.typePrefix, "");
        switch (baseType) {
          case "start":
            return "编辑开始节点";
          case "end":
            return "编辑结束节点";
          case "task":
            return "编辑审批节点";
          case "custom":
            return "编辑自定义节点";
          case "subProcess":
            return "编辑子流程";
          case "condition":
            return "编辑条件分支（决策配置）";
          case "fork":
            return "编辑并行分支";
          default:
            return "编辑节点";
        }
      });
      const schemaByType = {
        task,
        condition: decision,
        custom,
        subProcess,
        start,
        end
      };
      const editingPatternForm = vue.ref(void 0);
      const editFormFields = vue.computed(() => {
        if (editingBranch.value) {
          const fields2 = [
            { name: "displayName", label: "分支名称", component: "Input", componentProps: { placeholder: "请输入分支名称" } }
          ];
          if (editingBranchType.value === "condition") {
            fields2.push({ name: "expr", label: "条件表达式", component: "Input", componentProps: { placeholder: "请输入条件表达式" } });
          }
          return fields2;
        }
        if (!editingNode.value) return [];
        const baseType = editingNode.value.type.replace(props.typePrefix, "");
        const common = [
          { name: "name", label: "唯一编码", component: "Input", componentProps: { placeholder: "请输入唯一编码" } },
          { name: "displayName", label: "显示名称", component: "Input", componentProps: { placeholder: "请输入显示名称" } }
        ];
        const formConfig = editingPatternForm.value || schemaByType[baseType];
        if (!(formConfig == null ? void 0 : formConfig.formItems)) return common;
        let fields = formConfig.formItems.filter((f) => f.name !== "__schema__");
        if (!fields.some((f) => f.name === "displayName") && baseType !== "start" && baseType !== "end") {
          const idx = fields.findIndex((f) => f.name === "name");
          const dn = { name: "displayName", label: "显示名称", component: "Input", componentProps: { placeholder: "请输入显示名称" } };
          fields = [...fields.slice(0, idx + 1), dn, ...fields.slice(idx + 1)];
        }
        return fields;
      });
      function cancelEditPanel() {
        editingNode.value = null;
        editingBranch.value = null;
      }
      function applyEditFormToTarget() {
        if (editingBranch.value) {
          editingBranch.value.name = editFormData.displayName;
          editingBranch.value.properties = {
            ...editingBranch.value.properties,
            expr: editFormData.expr,
            name: editFormData.name
          };
          return;
        }
        if (editingNode.value) {
          const fields = editFormFields.value;
          if (fields.some((f) => f.name === "displayName")) {
            editingNode.value.name = editFormData.displayName;
          }
          const nextProps = {
            ...editingNode.value.properties,
            name: editFormData.name
          };
          for (const f of fields) {
            if (f.name === "name" || f.name === "displayName") continue;
            nextProps[f.name] = editFormData[f.name];
          }
          editingNode.value.properties = nextProps;
        }
      }
      vue.watch(
        editFormData,
        () => {
          if (editingNode.value || editingBranch.value) {
            applyEditFormToTarget();
          }
        },
        { deep: true }
      );
      function handleContextmenu(_e) {
        if (props.viewer) return;
        const processFormConfig = props.processForm || process;
        const processProperties = {};
        if (processFormConfig == null ? void 0 : processFormConfig.formItems) {
          for (const item of processFormConfig.formItems) {
            if (props.value && Object.prototype.hasOwnProperty.call(props.value, item.name)) {
              processProperties[item.name] = props.value[item.name];
            }
          }
        }
        const eventParams = {
          data: {
            type: "process",
            properties: processProperties
          },
          patternItem: { form: processFormConfig },
          lf: designerApi
        };
        if (props.blankContextmenu && typeof props.blankContextmenu === "function") {
          props.blankContextmenu(eventParams);
          return;
        }
        if (processFormFields.value.length > 0) {
          openProcessDrawer();
        }
      }
      const showDataModal = vue.ref(false);
      const viewDataJson = vue.ref("");
      const viewDataObj = vue.computed(() => {
        try {
          return JSON.parse(viewDataJson.value || "{}");
        } catch {
          return {};
        }
      });
      const showImportModal = vue.ref(false);
      const importDataJson = vue.ref("");
      const importError = vue.ref("");
      const showProcessDrawer = vue.ref(false);
      const processFormData = vue.reactive({});
      const processFormFields = vue.computed(() => {
        var _a;
        const formItems = (_a = props.processForm || process) == null ? void 0 : _a.formItems;
        if (!formItems) return [];
        return formItems.filter((f) => f.name !== "__schema__");
      });
      function openProcessDrawer() {
        processFormFields.value.forEach((f) => {
          var _a;
          processFormData[f.name] = ((_a = props.value) == null ? void 0 : _a[f.name]) ?? f.defaultValue ?? "";
        });
        showProcessDrawer.value = true;
      }
      function closeProcessDrawer() {
        showProcessDrawer.value = false;
        const newValue = { ...props.value, ...processFormData };
        isInternalUpdate = true;
        emit("update:value", newValue);
        eventCenter.emit("update:graphModel", newValue);
      }
      vue.watch(
        processFormData,
        () => {
          if (!showProcessDrawer.value) return;
          const newValue = { ...props.value, ...processFormData };
          isInternalUpdate = true;
          emit("update:value", newValue);
          eventCenter.emit("update:graphModel", newValue);
        },
        { deep: true }
      );
      function handleControlSave() {
        const graphData = treeToGraph(treeData.value, props.typePrefix);
        const saveData = {
          ...props.value,
          nodes: graphData.nodes,
          edges: graphData.edges,
          mode: "dingtalk"
        };
        emit("save", saveData);
      }
      function handleControlClear() {
        const startNode = {
          id: generateId(),
          type: `${props.typePrefix}start`,
          name: "开始",
          properties: {},
          children: {
            id: generateId(),
            type: `${props.typePrefix}task`,
            name: "申请",
            properties: {},
            children: {
              id: generateId(),
              type: `${props.typePrefix}end`,
              name: "结束",
              properties: {}
            }
          }
        };
        treeData.value = startNode;
        syncToGraph();
      }
      function handleControlViewData() {
        const graphData = treeToGraph(treeData.value, props.typePrefix);
        const data = {
          ...props.value,
          nodes: graphData.nodes,
          edges: graphData.edges,
          mode: "dingtalk"
        };
        viewDataJson.value = JSON.stringify(data, null, 2);
        showDataModal.value = true;
      }
      function handleControlImportData() {
        importDataJson.value = "";
        showImportModal.value = true;
      }
      function doImport() {
        importError.value = "";
        const snapshot = JSON.stringify(treeData.value);
        try {
          const data = JSON.parse(importDataJson.value);
          if (!data || typeof data !== "object") {
            importError.value = "导入失败：数据格式不正确";
            return;
          }
          if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
            importError.value = "导入失败：缺少 nodes 或 edges 数组";
            return;
          }
          for (const n of data.nodes) {
            if (!n || typeof n.id !== "string" || typeof n.type !== "string") {
              importError.value = "导入失败：节点缺少 id 或 type 字段";
              return;
            }
          }
          for (const e of data.edges) {
            if (!e || typeof e.id !== "string" || typeof e.sourceNodeId !== "string" || typeof e.targetNodeId !== "string") {
              importError.value = "导入失败：边缺少 id / sourceNodeId / targetNodeId 字段";
              return;
            }
          }
          isInternalUpdate = true;
          const newValue = {
            ...props.value,
            nodes: data.nodes,
            edges: data.edges,
            mode: data.mode === "canvas" ? "canvas" : "dingtalk"
          };
          emit("update:value", newValue);
          treeData.value = graphToTree(newValue.nodes || [], newValue.edges || [], props.typePrefix);
          showImportModal.value = false;
        } catch (err) {
          importError.value = "导入失败：JSON 格式不正确";
          try {
            treeData.value = JSON.parse(snapshot);
          } catch {
          }
        }
      }
      function copyData() {
        var _a;
        try {
          if (((_a = navigator.clipboard) == null ? void 0 : _a.writeText) && window.isSecureContext) {
            navigator.clipboard.writeText(viewDataJson.value);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = viewDataJson.value;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }
          FDMessage.success("复制成功");
        } catch (err) {
          FDMessage.error(`复制失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      function handleControlFullscreen() {
        var _a, _b;
        const el = document.querySelector(".ding-designer");
        if (!el) return;
        if (!document.fullscreenElement) {
          (_a = el.requestFullscreen) == null ? void 0 : _a.call(el).catch(() => {
          });
        } else {
          (_b = document.exitFullscreen) == null ? void 0 : _b.call(document).catch(() => {
          });
        }
      }
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", {
          class: "ding-designer",
          style: vue.normalizeStyle(containerStyle.value),
          onContextmenu: vue.withModifiers(handleContextmenu, ["prevent"])
        }, [
          vue.createVNode(_sfc_main$2, {
            "init-control": __props.initControl,
            control: computedControlItems.value,
            viewer: __props.viewer,
            onSave: handleControlSave,
            onClear: handleControlClear,
            onViewData: handleControlViewData,
            onImportData: handleControlImportData,
            onFullscreen: handleControlFullscreen
          }, null, 8, ["init-control", "control", "viewer"]),
          vue.createElementVNode("div", {
            class: vue.normalizeClass(["ding-designer__canvas", { "is-dragging": isDragging.value, "is-touch-dragging": isTouchDragging.value, "is-pinching": isPinching.value }]),
            ref_key: "canvasRef",
            ref: canvasRef,
            onWheel: handleWheel,
            onMousedown: handleCanvasMouseDown,
            onTouchstartPassive: handleTouchStart,
            onTouchmovePassive: handleTouchMove,
            onTouchendPassive: handleTouchEnd,
            onTouchcancelPassive: handleTouchEnd
          }, [
            vue.createElementVNode("div", {
              class: "ding-designer__viewport",
              style: vue.normalizeStyle(viewportStyle.value),
              onMousedown: handleViewportMouseDown
            }, [
              treeData.value ? (vue.openBlock(), vue.createBlock(_sfc_main$3, {
                key: 0,
                node: treeData.value,
                "type-prefix": __props.typePrefix,
                viewer: __props.viewer,
                "high-light": __props.highLight,
                theme: __props.theme,
                "dnd-panel": computedDndPanel.value,
                "protected-ids": protectedIds.value,
                "can-delete-checker": canDeleteNode,
                onEdit: handleEditNode,
                onDelete: handleDeleteNode,
                onAdd: handleAddNode,
                onAddBranch: handleAddBranch,
                onEditBranch: handleEditBranch,
                onAddToBranch: handleAddToBranch
              }, null, 8, ["node", "type-prefix", "viewer", "high-light", "theme", "dnd-panel", "protected-ids"])) : (vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, _cache[5] || (_cache[5] = [
                vue.createElementVNode("div", { class: "ding-empty__title" }, "暂无流程数据", -1)
              ])))
            ], 36)
          ], 34),
          vue.createVNode(vue.unref(FDDrawer), {
            visible: showEditPanel.value,
            title: editPanelTitle.value,
            width: "600px",
            "show-footer": false,
            onCancel: cancelEditPanel
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(vue.unref(_sfc_main$c), {
                "form-items": editFormFields.value,
                model: editFormData,
                "label-width": "120px"
              }, null, 8, ["form-items", "model"])
            ]),
            _: 1
          }, 8, ["visible", "title"]),
          vue.createVNode(vue.unref(FDModal), {
            visible: showDataModal.value,
            "onUpdate:visible": _cache[0] || (_cache[0] = ($event) => showDataModal.value = $event),
            title: "流程数据",
            "cancel-text": "关闭",
            "ok-text": "复制",
            onOk: copyData,
            onCancel: _cache[1] || (_cache[1] = ($event) => showDataModal.value = false),
            width: "600px"
          }, {
            default: vue.withCtx(() => [
              vue.createElementVNode("div", _hoisted_2, [
                vue.createVNode(vue.unref(FDJsonViewer), {
                  showLineNumber: true,
                  data: viewDataObj.value
                }, null, 8, ["data"])
              ])
            ]),
            _: 1
          }, 8, ["visible"]),
          vue.createVNode(vue.unref(FDModal), {
            visible: showImportModal.value,
            "onUpdate:visible": _cache[3] || (_cache[3] = ($event) => showImportModal.value = $event),
            title: "导入流程数据",
            onOk: doImport,
            onCancel: _cache[4] || (_cache[4] = ($event) => showImportModal.value = false),
            width: "600px"
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(vue.unref(FDTextarea), {
                class: "ding-modal__textarea",
                modelValue: importDataJson.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => importDataJson.value = $event),
                placeholder: "请粘贴 JSON 数据"
              }, null, 8, ["modelValue"]),
              importError.value ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_3, vue.toDisplayString(importError.value), 1)) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["visible"]),
          vue.createVNode(vue.unref(FDDrawer), {
            visible: showProcessDrawer.value,
            title: "流程属性",
            width: "600px",
            "show-footer": false,
            onCancel: closeProcessDrawer
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(vue.unref(_sfc_main$c), {
                "form-items": processFormFields.value,
                model: processFormData,
                "label-width": "130px"
              }, null, 8, ["form-items", "model"])
            ]),
            _: 1
          }, 8, ["visible"])
        ], 36);
      };
    }
  });
  const _hoisted_1 = { class: "flow-container" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index.dingtalk",
    props: MldongFlowDesignerProps,
    emits: ["update:value", "on-init", "on-render", "on-save", "node-click", "edge-click"],
    setup(__props, { expose: __expose, emit: __emit }) {
      const emits = __emit;
      const dingtalkDesignerRef = vue.ref();
      __expose({
        /**
         * 兼容双模式包的同名方法：返回 FDDesignerAPI
         * （其命名与画布模式 lf 实例对齐，业务方可按同一套代码消费）
         */
        getLfInstance() {
          return dingtalkDesignerRef.value;
        },
        getDesignerApi() {
          return dingtalkDesignerRef.value;
        }
      });
      return (_ctx, _cache) => {
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createVNode(_sfc_main$1, {
            ref_key: "dingtalkDesignerRef",
            ref: dingtalkDesignerRef,
            value: _ctx.value,
            theme: _ctx.theme,
            "high-light": _ctx.highLight,
            viewer: _ctx.viewer,
            "dnd-panel": _ctx.dndPanel,
            "process-form": _ctx.processForm,
            "edge-form": _ctx.edgeForm,
            "node-click": _ctx.nodeClick,
            "edge-click": _ctx.edgeClick,
            "blank-contextmenu": _ctx.blankContextmenu,
            control: _ctx.control,
            "init-control": _ctx.initControl,
            "drawer-width": _ctx.drawerWidth,
            "modal-width": _ctx.modalWidth,
            "type-prefix": _ctx.typePrefix,
            "default-edge-type": _ctx.defaultEdgeType,
            "onUpdate:value": _cache[0] || (_cache[0] = (data) => emits("update:value", data)),
            onSave: _cache[1] || (_cache[1] = (data) => emits("on-save", data)),
            onOnInit: _cache[2] || (_cache[2] = (api) => emits("on-init", api)),
            onOnRender: _cache[3] || (_cache[3] = (api) => emits("on-render", api)),
            onNodeClick: _cache[4] || (_cache[4] = (params) => emits("node-click", params)),
            onEdgeClick: _cache[5] || (_cache[5] = (params) => emits("edge-click", params))
          }, null, 8, ["value", "theme", "high-light", "viewer", "dnd-panel", "process-form", "edge-form", "node-click", "edge-click", "blank-contextmenu", "control", "init-control", "drawer-width", "modal-width", "type-prefix", "default-edge-type"])
        ]);
      };
    }
  });
  const FlowDesigner = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-2c7582ca"]]);
  const MFlowDesigner = FlowDesigner;
  MFlowDesigner.install = function(app, options) {
    app.component("MldongFlowDesignerPlus", MFlowDesigner);
  };
  return MFlowDesigner;
});
//# sourceMappingURL=mldong-flow-designer-dingtalk.umd.cjs.map
