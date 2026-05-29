figma.showUI(__html__, { width: 360, height: 420 });

type SelectionInfo = {
  id: string;
  name: string;
  type: string;
  childCount: number;
} | null;

const EXPORTABLE_TYPES = new Set([
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'GROUP',
  'SECTION',
]);

function getSelectionInfo(): SelectionInfo {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) return null;
  const node = sel[0];
  const childCount =
    'children' in node ? (node.children as readonly SceneNode[]).length : 0;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    childCount,
  };
}

function pushSelection() {
  figma.ui.postMessage({
    type: 'selection',
    selection: getSelectionInfo(),
  });
}

function serializePaint(paint: Paint): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: paint.type,
    visible: paint.visible ?? true,
    opacity: paint.opacity ?? 1,
    blendMode: paint.blendMode,
  };
  if (paint.type === 'SOLID') {
    base.color = paint.color;
  } else if (
    paint.type === 'GRADIENT_LINEAR' ||
    paint.type === 'GRADIENT_RADIAL' ||
    paint.type === 'GRADIENT_ANGULAR' ||
    paint.type === 'GRADIENT_DIAMOND'
  ) {
    base.gradientStops = paint.gradientStops;
    base.gradientTransform = paint.gradientTransform;
  } else if (paint.type === 'IMAGE') {
    base.imageHash = paint.imageHash;
    base.scaleMode = paint.scaleMode;
  }
  return base;
}

function getValue<T>(node: SceneNode, key: string): T | undefined {
  const value = (node as unknown as Record<string, unknown>)[key];
  if (value === undefined || value === figma.mixed) return undefined;
  return value as T;
}

const SVG_EXPORT_TYPES = new Set<string>([
  'VECTOR',
  'BOOLEAN_OPERATION',
  'LINE',
  'STAR',
  'POLYGON',
  'ELLIPSE',
]);

async function exportSvg(node: SceneNode): Promise<string | undefined> {
  try {
    const bytes = await (node as ExportMixin).exportAsync({ format: 'SVG_STRING' } as ExportSettingsSVGString);
    return bytes as unknown as string;
  } catch {
    return undefined;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const total = items.length;
  const workers = new Array(Math.min(limit, total || 1)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= total) return;
      results[i] = await fn(items[i], i);
      done++;
      if (onProgress && (done % 10 === 0 || done === total)) onProgress(done, total);
    }
  });
  await Promise.all(workers);
  return results;
}

function collectSvgTargets(node: SceneNode, out: SceneNode[]): void {
  if (SVG_EXPORT_TYPES.has(node.type)) {
    out.push(node);
    return;
  }
  if ('children' in node) {
    for (const child of node.children as readonly SceneNode[]) {
      collectSvgTargets(child, out);
    }
  }
}

function collectInstances(node: SceneNode, out: InstanceNode[]): void {
  if (node.type === 'INSTANCE') {
    out.push(node as InstanceNode);
  }
  if (SVG_EXPORT_TYPES.has(node.type)) return;
  if ('children' in node) {
    for (const child of node.children as readonly SceneNode[]) {
      collectInstances(child, out);
    }
  }
}

let __nodeCount = 0;
let __nodeTotal = 0;

type MainCompInfo = { id: string; name: string; key: string };

function serializeNodeSync(
  node: SceneNode,
  svgCache: Map<string, string>,
  mainCompCache: Map<string, MainCompInfo>
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    locked: node.locked,
  };

  if ('x' in node) {
    data.x = node.x;
    data.y = node.y;
    data.width = node.width;
    data.height = node.height;
    data.rotation = (node as LayoutMixin).rotation;
  }

  if ('opacity' in node) data.opacity = getValue<number>(node, 'opacity');
  if ('blendMode' in node) data.blendMode = getValue<string>(node, 'blendMode');
  if ('cornerRadius' in node) {
    data.cornerRadius = getValue<number>(node, 'cornerRadius');
  }

  const fills = getValue<readonly Paint[]>(node, 'fills');
  if (fills) data.fills = fills.map(serializePaint);

  const strokes = getValue<readonly Paint[]>(node, 'strokes');
  if (strokes && strokes.length > 0) {
    data.strokes = strokes.map(serializePaint);
    data.strokeWeight = getValue<number>(node, 'strokeWeight');
    data.strokeAlign = getValue<string>(node, 'strokeAlign');
  }

  const effects = getValue<readonly Effect[]>(node, 'effects');
  if (effects && effects.length > 0) data.effects = effects;

  if ('layoutMode' in node) {
    const frame = node as FrameNode;
    const layoutMode = frame.layoutMode;
    if (layoutMode && layoutMode !== 'NONE') {
      data.layout = {
        layoutMode,
        primaryAxisAlignItems: frame.primaryAxisAlignItems,
        counterAxisAlignItems: frame.counterAxisAlignItems,
        primaryAxisSizingMode: frame.primaryAxisSizingMode,
        counterAxisSizingMode: frame.counterAxisSizingMode,
        itemSpacing: frame.itemSpacing,
        paddingTop: frame.paddingTop,
        paddingRight: frame.paddingRight,
        paddingBottom: frame.paddingBottom,
        paddingLeft: frame.paddingLeft,
      };
    }
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    data.characters = textNode.characters;
    data.fontSize = getValue<number>(textNode, 'fontSize');
    data.fontName = getValue<FontName>(textNode, 'fontName');
    data.fontWeight = getValue<number>(textNode, 'fontWeight');
    data.letterSpacing = getValue<LetterSpacing>(textNode, 'letterSpacing');
    data.lineHeight = getValue<LineHeight>(textNode, 'lineHeight');
    data.textAlignHorizontal = textNode.textAlignHorizontal;
    data.textAlignVertical = textNode.textAlignVertical;
    data.textAutoResize = textNode.textAutoResize;
    data.textCase = getValue<string>(textNode, 'textCase');
    data.textDecoration = getValue<string>(textNode, 'textDecoration');
  }

  if (node.type === 'INSTANCE') {
    const info = mainCompCache.get(node.id);
    if (info) data.mainComponent = info;
  }

  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    const comp = node as ComponentNode | ComponentSetNode;
    data.key = comp.key;
    data.description = comp.description;
  }

  const vectorPaths = getValue<readonly VectorPath[]>(node, 'vectorPaths');
  if (vectorPaths && vectorPaths.length > 0) data.vectorPaths = vectorPaths;

  if (SVG_EXPORT_TYPES.has(node.type)) {
    const svg = svgCache.get(node.id);
    if (svg) data.svg = svg;
    return data;
  }

  if ('children' in node) {
    const kids = node.children as readonly SceneNode[];
    const serialized: Record<string, unknown>[] = [];
    for (const child of kids) serialized.push(serializeNodeSync(child, svgCache, mainCompCache));
    data.children = serialized;
  }

  __nodeCount++;
  return data;
}

async function serializeRoot(node: SceneNode): Promise<Record<string, unknown>> {
  const svgTargets: SceneNode[] = [];
  collectSvgTargets(node, svgTargets);

  const instances: InstanceNode[] = [];
  collectInstances(node, instances);

  figma.ui.postMessage({
    type: 'export-progress',
    message: `Exporting ${svgTargets.length} vector(s)...`,
  });

  const svgs = await mapWithConcurrency(
    svgTargets,
    8,
    (n) => exportSvg(n),
    (done, total) => {
      figma.ui.postMessage({
        type: 'export-progress',
        message: `Exporting vectors: ${done}/${total}`,
      });
    }
  );

  const svgCache = new Map<string, string>();
  svgTargets.forEach((n, i) => {
    const v = svgs[i];
    if (v) svgCache.set(n.id, v);
  });

  figma.ui.postMessage({
    type: 'export-progress',
    message: `Resolving ${instances.length} instance(s)...`,
  });

  const mainCompCache = new Map<string, MainCompInfo>();
  const mainResults = await mapWithConcurrency(
    instances,
    8,
    async (inst) => {
      try {
        const getter = (inst as unknown as {
          getMainComponentAsync?: () => Promise<ComponentNode | null>;
        }).getMainComponentAsync;
        const main = typeof getter === 'function'
          ? await getter.call(inst)
          : (inst as InstanceNode).mainComponent;
        return main;
      } catch {
        return null;
      }
    },
    (done, total) => {
      figma.ui.postMessage({
        type: 'export-progress',
        message: `Resolving instances: ${done}/${total}`,
      });
    }
  );
  instances.forEach((inst, i) => {
    const main = mainResults[i];
    if (main) {
      mainCompCache.set(inst.id, { id: main.id, name: main.name, key: main.key });
    }
  });

  figma.ui.postMessage({
    type: 'export-progress',
    message: 'Building JSON...',
  });

  __nodeCount = 0;
  __nodeTotal = 0;
  return serializeNodeSync(node, svgCache, mainCompCache);
}

function rgbToHex(c: RGB | RGBA): string {
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  const hex = `#${to(c.r)}${to(c.g)}${to(c.b)}`;
  if ('a' in c && c.a !== undefined && c.a < 1) {
    return `${hex}${to(c.a)}`;
  }
  return hex;
}

function serializeVariableValue(value: VariableValue): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'type' in value &&
    (value as VariableAlias).type === 'VARIABLE_ALIAS'
  ) {
    return { type: 'VARIABLE_ALIAS', id: (value as VariableAlias).id };
  }
  if (value && typeof value === 'object' && 'r' in value) {
    const c = value as RGB | RGBA;
    return { r: c.r, g: c.g, b: c.b, a: 'a' in c ? c.a : 1, hex: rgbToHex(c) };
  }
  return value;
}

async function exportLibrary() {
  figma.notify('Collecting library…');
  figma.ui.postMessage({ type: 'export-progress', message: 'Loading pages…' });

  try {
    await figma.loadAllPagesAsync();
  } catch (err) {
    console.warn('loadAllPagesAsync failed', err);
  }

  figma.ui.postMessage({ type: 'export-progress', message: 'Reading styles…' });

  const getStyles = async <T>(asyncName: string, syncName: string): Promise<T[]> => {
    const api = figma as unknown as Record<string, () => unknown>;
    if (typeof api[asyncName] === 'function') {
      return (await (api[asyncName] as () => Promise<T[]>)()) as T[];
    }
    if (typeof api[syncName] === 'function') {
      return (api[syncName] as () => T[])();
    }
    return [];
  };

  const paintStylesRaw = await getStyles<PaintStyle>(
    'getLocalPaintStylesAsync',
    'getLocalPaintStyles'
  );
  const paintStyles = paintStylesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    paints: s.paints.map(serializePaint),
  }));

  const textStylesRaw = await getStyles<TextStyle>(
    'getLocalTextStylesAsync',
    'getLocalTextStyles'
  );
  const textStyles = textStylesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    fontName: s.fontName,
    fontSize: s.fontSize,
    letterSpacing: s.letterSpacing,
    lineHeight: s.lineHeight,
    paragraphIndent: s.paragraphIndent,
    paragraphSpacing: s.paragraphSpacing,
    textCase: s.textCase,
    textDecoration: s.textDecoration,
  }));

  const effectStylesRaw = await getStyles<EffectStyle>(
    'getLocalEffectStylesAsync',
    'getLocalEffectStyles'
  );
  const effectStyles = effectStylesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    effects: s.effects,
  }));

  const gridStylesRaw = await getStyles<GridStyle>(
    'getLocalGridStylesAsync',
    'getLocalGridStyles'
  );
  const gridStyles = gridStylesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    layoutGrids: s.layoutGrids,
  }));

  const variableCollections: Record<string, unknown>[] = [];
  const variables: Record<string, unknown>[] = [];
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    for (const c of collections) {
      variableCollections.push({
        id: c.id,
        name: c.name,
        modes: c.modes,
        defaultModeId: c.defaultModeId,
        variableIds: c.variableIds,
      });
    }
    const vars = await figma.variables.getLocalVariablesAsync();
    for (const v of vars) {
      const valuesByMode: Record<string, unknown> = {};
      for (const modeId of Object.keys(v.valuesByMode)) {
        valuesByMode[modeId] = serializeVariableValue(v.valuesByMode[modeId]);
      }
      variables.push({
        id: v.id,
        name: v.name,
        description: v.description,
        resolvedType: v.resolvedType,
        variableCollectionId: v.variableCollectionId,
        scopes: v.scopes,
        valuesByMode,
      });
    }
  } catch (err) {
    console.warn('Variables API unavailable', err);
  }

  figma.ui.postMessage({ type: 'export-progress', message: 'Scanning components…' });

  const components: Record<string, unknown>[] = [];
  const componentSets: Record<string, unknown>[] = [];
  const componentNodes: { node: ComponentNode; page: PageNode }[] = [];
  for (const page of figma.root.children) {
    const found = page.findAllWithCriteria({
      types: ['COMPONENT', 'COMPONENT_SET'],
    });
    for (const n of found) {
      const isIcon =
        n.width <= 64 && n.height <= 64 && n.type === 'COMPONENT';
      const entry: Record<string, unknown> = {
        id: n.id,
        name: n.name,
        type: n.type,
        key: n.key,
        description: n.description,
        page: page.name,
        width: n.width,
        height: n.height,
        isIcon,
      };
      if (n.type === 'COMPONENT_SET') {
        entry.children = (n as ComponentSetNode).children.map((c) => ({
          id: c.id,
          name: c.name,
          width: c.width,
          height: c.height,
        }));
        componentSets.push(entry);
      } else {
        componentNodes.push({ node: n as ComponentNode, page });
        components.push(entry);
      }
    }
  }

  const componentSvgs = await mapWithConcurrency(
    componentNodes,
    8,
    ({ node }) => exportSvg(node as unknown as SceneNode),
    (done, total) => {
      figma.ui.postMessage({
        type: 'export-progress',
        message: `Exporting components: ${done}/${total}`,
      });
    }
  );
  componentNodes.forEach((_, i) => {
    const svg = componentSvgs[i];
    if (svg) components[i].svg = svg;
  });

  const colorMap = new Map<string, { hex: string; count: number; sources: Set<string> }>();
  const addColor = (paint: Paint, source: string) => {
    if (paint.type !== 'SOLID') return;
    if (paint.visible === false) return;
    const hex = rgbToHex({ ...paint.color, a: paint.opacity ?? 1 });
    const entry = colorMap.get(hex) ?? { hex, count: 0, sources: new Set<string>() };
    entry.count += 1;
    entry.sources.add(source);
    colorMap.set(hex, entry);
  };
  for (const page of figma.root.children) {
    const nodes = page.findAll(() => true);
    for (const n of nodes) {
      const fills = getValue<readonly Paint[]>(n as SceneNode, 'fills');
      if (fills) fills.forEach((p) => addColor(p, `${page.name} / fills`));
      const strokes = getValue<readonly Paint[]>(n as SceneNode, 'strokes');
      if (strokes) strokes.forEach((p) => addColor(p, `${page.name} / strokes`));
    }
  }
  const colors = Array.from(colorMap.values())
    .map((c) => ({ hex: c.hex, count: c.count, sources: Array.from(c.sources) }))
    .sort((a, b) => b.count - a.count);

  const library = {
    file: { name: figma.root.name },
    exportedAt: new Date().toISOString(),
    paintStyles,
    textStyles,
    effectStyles,
    gridStyles,
    variableCollections,
    variables,
    colors,
    components,
    componentSets,
  };

  figma.ui.postMessage({
    type: 'export-result',
    fileName: `${figma.root.name || 'library'}.library.json`,
    json: library,
  });
  figma.notify(
    `Library exported: ${paintStyles.length} colors, ${textStyles.length} text, ${components.length} components`
  );
}

async function exportSelection() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify('Select a frame or component first');
    return;
  }
  const node = sel[0];
  if (!EXPORTABLE_TYPES.has(node.type)) {
    figma.notify(`Cannot export ${node.type}. Select a frame or component.`);
    return;
  }
  try {
    figma.ui.postMessage({ type: 'export-progress', message: 'Starting export...' });
    const json = await serializeRoot(node);
    figma.ui.postMessage({
      type: 'export-result',
      fileName: `${node.name || 'export'}.json`,
      json,
    });
    figma.notify(`Exported "${node.name}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    figma.ui.postMessage({ type: 'export-error', message });
    figma.notify(`Export failed: ${message}`, { error: true });
  }
}

pushSelection();

figma.on('selectionchange', pushSelection);
figma.on('currentpagechange', pushSelection);

figma.ui.onmessage = (msg: { type: string }) => {
  if (msg.type === 'export') {
    void exportSelection();
  } else if (msg.type === 'export-library') {
    void exportLibrary();
  } else if (msg.type === 'request-selection') {
    pushSelection();
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};
