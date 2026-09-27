import { Diagnostic } from "./errors.js";
import { compileComponentPlan, validateComponentPlan } from "./componentPlan.js";
import {
  ComponentAssemblyDefinition,
  ComponentNode,
  ComponentPlanDocument,
  ComponentStructuralIntent,
  StructuralSupportPolicy,
  Vec3,
  VoxelBlock,
  VoxelPlan,
} from "./types.js";

export interface SupportAnalysisBounds {
  min: Vec3;
  max: Vec3;
}

export type SupportDiagnosticCode =
  | "DISCONNECTED_COMPONENT"
  | "FLOATING_SOURCE_NODE"
  | "LARGE_CANTILEVER"
  | "MINIMAL_ATTACHMENT"
  | "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED";

export interface SupportDiagnostic extends Diagnostic {
  stage: "support-analysis";
  code: SupportDiagnosticCode | `ALLOWED_${SupportDiagnosticCode}`;
  count: number;
  bounds: SupportAnalysisBounds;
  supportPolicy: StructuralSupportPolicy;
  supportRoots?: string[];
  maxCantilever?: number;
}

export type SupportDiagnosticClassification = "blocking" | "review" | "allowed";

export interface SupportDiagnosticSummary {
  totalDiagnostics: number;
  blockingDiagnostics: number;
  reviewDiagnostics: number;
  allowedDiagnostics: number;
  byCode: Record<string, number>;
}

export interface SupportQualityGateSummary {
  status: "pass" | "review" | "block";
  blockingReasons: string[];
  reviewReasons: string[];
}

export interface SupportAnalysisSummary {
  totalBlocks: number;
  verticalUnsupportedBlocks: number;
  disconnectedBlocks: number;
  largeCantileverBlocks: number;
  diagnostics: SupportDiagnosticSummary;
  qualityGate: SupportQualityGateSummary;
}

export interface SupportSourceSummary {
  sourceNodeId: string;
  componentId?: string;
  count: number;
  bounds: SupportAnalysisBounds;
  supportPolicy: StructuralSupportPolicy;
  supportRoots?: string[];
  maxCantilever?: number;
  verticalUnsupportedBlocks: number;
  disconnectedBlocks: number;
  largeCantileverBlocks: number;
}

export interface SupportAnalysisOptions {
  groundY?: number;
  includeAllowed?: boolean;
  rootSourceNodeIdPrefixes?: string[];
  rootBoxes?: SupportAnalysisBounds[];
  ignoredSourceNodeIdPrefixes?: string[];
  ignoredBlockNames?: string[];
  maxDiagnosticsPerCode?: number;
  maxDiagnosticsPerSource?: number;
  minDiagnosticBlocks?: number;
  maxCantilever?: number;
  minAttachmentContacts?: number;
}

export interface SupportAnalysisResult {
  summary: SupportAnalysisSummary;
  diagnostics: SupportDiagnostic[];
  sourceSummaries: SupportSourceSummary[];
  totalBlocks: number;
  verticalUnsupportedBlocks: number;
  disconnectedBlocks: number;
  largeCantileverBlocks: number;
}

interface SourceStructuralEntry {
  prefix: string;
  componentId: string;
  declaredInputs: boolean;
  structural: Required<Pick<ComponentStructuralIntent, "supportPolicy">> & ComponentStructuralIntent;
}

interface SourceGroup {
  sourceNodeId: string;
  blocks: VoxelBlock[];
  bounds: SupportAnalysisBounds;
}

interface InternalSupportAnalysisOptions extends SupportAnalysisOptions {
  sourceStructural?: SourceStructuralEntry[];
}

export function analyzeComponentPlanSupport(
  doc: unknown,
  options: SupportAnalysisOptions = {}
): SupportAnalysisResult {
  const plan = validateComponentPlan(doc);
  return analyzeVoxelSupportInternal(compileComponentPlan(plan), {
    ...options,
    sourceStructural: collectSourceStructuralEntries(plan),
  });
}

export function analyzeVoxelSupport(
  voxelPlan: VoxelPlan,
  options: SupportAnalysisOptions = {}
): SupportAnalysisResult {
  return analyzeVoxelSupportInternal(voxelPlan, options);
}

function analyzeVoxelSupportInternal(
  voxelPlan: VoxelPlan,
  options: InternalSupportAnalysisOptions = {}
): SupportAnalysisResult {
  const groundY = options.groundY ?? 0;
  const ignoredBlockNames = new Set(options.ignoredBlockNames ?? ["minecraft:air", "air"]);
  const blocks = voxelPlan.blocks.filter((block) => !ignoredBlockNames.has(block.block.name));
  const blockMap = new Map(blocks.map((block) => [posKey(block.pos), block]));
  const ignoredSourceNodeIdPrefixes = options.ignoredSourceNodeIdPrefixes ?? [];
  const rootSourceNodeIdPrefixes = options.rootSourceNodeIdPrefixes ?? [];
  const rootBoxes = options.rootBoxes ?? [];
  const connected = connectedToRoots(blocks, blockMap, groundY, rootSourceNodeIdPrefixes, rootBoxes);
  const verticalUnsupported = blocks.filter((block) => {
    if (isSupportRoot(block, groundY, rootSourceNodeIdPrefixes, rootBoxes)) {
      return false;
    }
    return !blockMap.has(posKey([block.pos[0], block.pos[1] - 1, block.pos[2]]));
  });
  const disconnected = blocks.filter((block) => !connected.has(posKey(block.pos)));
  const largeCantilever = findLargeCantileverBlocks(
    verticalUnsupported.filter((block) => connected.has(posKey(block.pos))),
    blockMap,
    groundY,
    options
  );

  // Reclassify: sub-parts of known components (e.g. upper SteppedDome tiers)
  // should produce review-level diagnostics, not blocking ones — but only when
  // their owning component still has connected blocks. A nested component that
  // is entirely disconnected must stay blocking so true floating is reported.
  const sourceStructural = options.sourceStructural ?? [];
  const knownParentPrefixes = new Set(sourceStructural.map((e) => e.prefix));
  const connectedAncestorPrefixes = collectConnectedAncestorPrefixes(blocks, connected);

  const reviewDisconnected = disconnected.filter((block) => {
    const sourceNodeId = block.sourceNodeId ?? "unknown";
    return hasConnectedKnownAncestor(sourceNodeId, knownParentPrefixes, connectedAncestorPrefixes);
  });
  const reviewDisconnectedSet = new Set(reviewDisconnected);
  const blockingDisconnected = disconnected.filter((block) => {
    return !reviewDisconnectedSet.has(block);
  });
  const diagnostics = [
    ...groupsToDiagnostics(
      groupBySource(blockingDisconnected, ignoredSourceNodeIdPrefixes),
      "DISCONNECTED_COMPONENT",
      "Blocks are not connected to the configured support roots.",
      "Connect this component to a foundation, input support, or mark it as may_float/decorative if intentional.",
      options
    ),
    ...groupsToDiagnostics(
      groupBySource(blockingDisconnected, ignoredSourceNodeIdPrefixes),
      "FLOATING_SOURCE_NODE",
      "This source node contributes blocks that are disconnected from the configured support roots.",
      "Move the source node onto a supported component, add connectors, or mark it as may_float/decorative if intentional.",
      options
    ),
    ...groupsToDiagnostics(
      groupBySource(reviewDisconnected, ignoredSourceNodeIdPrefixes),
      "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED",
      "Blocks are disconnected but their parent component has connected sub-parts (e.g. upper dome or tier levels).",
      "This is expected for multi-level shape primitives. Add structural intent if unintended.",
      options
    ),
    ...groupsToDiagnostics(
      groupBySource(largeCantilever, ignoredSourceNodeIdPrefixes),
      "LARGE_CANTILEVER",
      "Blocks exceed the configured cantilever distance from nearby vertical support.",
      "Add posts, brackets, arches, cables, or lower the maxCantilever threshold if this span is intentional.",
      options
    ),
    ...groupsToDiagnostics(
      groupBySource(verticalUnsupported.filter((block) => connected.has(posKey(block.pos))), ignoredSourceNodeIdPrefixes),
      "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED",
      "Blocks have air directly below but are still connected through adjacent blocks.",
      "This may be acceptable for rails, roofs, bridges, or spans. Add structural intent if it is intentional.",
      options
    ),
    ...findMinimalAttachmentDiagnostics(blocks, blockMap, connected, options),
  ];

  const limitedDiagnostics = limitDiagnostics(diagnostics, options.maxDiagnosticsPerCode ?? 20, options.maxDiagnosticsPerSource);
  const sourceSummaries = summarizeSources(blocks, verticalUnsupported, disconnected, largeCantilever, ignoredSourceNodeIdPrefixes, options);
  const totals = {
    totalBlocks: blocks.length,
    verticalUnsupportedBlocks: verticalUnsupported.length,
    disconnectedBlocks: disconnected.length,
    largeCantileverBlocks: largeCantilever.length,
  };

  return {
    summary: summarizeSupportAnalysis(limitedDiagnostics, totals),
    diagnostics: limitedDiagnostics,
    sourceSummaries,
    totalBlocks: blocks.length,
    verticalUnsupportedBlocks: verticalUnsupported.length,
    disconnectedBlocks: disconnected.length,
    largeCantileverBlocks: largeCantilever.length,
  };
}

export function classifySupportDiagnostic(diagnostic: SupportDiagnostic): SupportDiagnosticClassification {
  if (diagnostic.code.startsWith("ALLOWED_")) {
    return "allowed";
  }

  switch (diagnostic.code) {
    case "DISCONNECTED_COMPONENT":
    case "FLOATING_SOURCE_NODE":
      return "blocking";
    case "LARGE_CANTILEVER":
    case "MINIMAL_ATTACHMENT":
    case "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED":
      return "review";
    default:
      return "review";
  }
}

function summarizeSupportAnalysis(
  diagnostics: SupportDiagnostic[],
  totals: Pick<SupportAnalysisSummary, "totalBlocks" | "verticalUnsupportedBlocks" | "disconnectedBlocks" | "largeCantileverBlocks">
): SupportAnalysisSummary {
  const byCode: Record<string, number> = {};
  let blockingDiagnostics = 0;
  let reviewDiagnostics = 0;
  let allowedDiagnostics = 0;

  for (const diagnostic of diagnostics) {
    byCode[diagnostic.code] = (byCode[diagnostic.code] ?? 0) + 1;

    switch (classifySupportDiagnostic(diagnostic)) {
      case "blocking":
        blockingDiagnostics += 1;
        break;
      case "review":
        reviewDiagnostics += 1;
        break;
      case "allowed":
        allowedDiagnostics += 1;
        break;
    }
  }

  return {
    ...totals,
    diagnostics: {
      totalDiagnostics: diagnostics.length,
      blockingDiagnostics,
      reviewDiagnostics,
      allowedDiagnostics,
      byCode,
    },
    qualityGate: {
      status: blockingDiagnostics > 0 ? "block" : reviewDiagnostics > 0 ? "review" : "pass",
      blockingReasons: blockingDiagnostics > 0 ? blockingReasonCodes(byCode) : [],
      reviewReasons: reviewDiagnostics > 0 ? reviewReasonCodes(byCode) : [],
    },
  };
}

function blockingReasonCodes(byCode: Record<string, number>): string[] {
  return ["DISCONNECTED_COMPONENT", "FLOATING_SOURCE_NODE"].filter((code) => (byCode[code] ?? 0) > 0);
}

function reviewReasonCodes(byCode: Record<string, number>): string[] {
  return ["LARGE_CANTILEVER", "MINIMAL_ATTACHMENT", "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED"].filter((code) => (byCode[code] ?? 0) > 0);
}

export function defaultStructuralIntentForComponent(component: ComponentNode): Required<Pick<ComponentStructuralIntent, "supportPolicy">> & ComponentStructuralIntent {
  if (component.structural?.supportPolicy) {
    return { ...component.structural, supportPolicy: component.structural.supportPolicy };
  }

  switch (component.type) {
    case "Foundation":
      return { ...component.structural, supportPolicy: "must_connect_to_ground" };
    case "Door":
    case "Window":
    case "Opening":
    case "Portal":
    case "RailingRun":
    case "Light":
      return { ...component.structural, supportPolicy: "decorative" };
    case "Instance":
    case "Repeat":
      return { ...component.structural, supportPolicy: "must_connect_to_input" };
    default:
      return { ...component.structural, supportPolicy: "must_connect_to_input" };
  }
}

// Structural entries must mirror the expanded node-id tree: repeat clones and
// instance assembly children are independent placements whose entries prevent
// a grounded sibling from marking the shared ancestor prefix connected and
// downgrading a floating sibling from blocking to review-level. Collection
// recurses through Instance assemblies and Repeat/RadialRepeat clones,
// carrying inherited intent with explicit child > Instance > Repeat > default
// precedence.
const MAX_STRUCTURAL_ENTRY_DEPTH = 16;
const NO_ASSEMBLIES = new Map<string, ComponentAssemblyDefinition>();

interface InheritedStructuralIntent {
  instanceIntent?: ComponentStructuralIntent;
  repeatIntent?: ComponentStructuralIntent;
}

function collectSourceStructuralEntries(plan: ComponentPlanDocument): SourceStructuralEntry[] {
  const entries: SourceStructuralEntry[] = [];
  const registeredPrefixes = new Set<string>();
  const rootAssemblies = new Map((plan.assemblies ?? []).map((assembly) => [assembly.id, assembly]));
  const rootComponents = plan.components ?? [];
  const rootComponentMap = new Map(rootComponents.map((component) => [component.id, component]));

  for (const component of rootComponents) {
    collectStructuralEntryTree(entries, registeredPrefixes, component, rootComponentMap, rootAssemblies, component.id);
  }

  for (const section of plan.sections ?? []) {
    const sectionAssemblies = new Map(rootAssemblies);
    for (const assembly of section.assemblies ?? []) {
      sectionAssemblies.set(assembly.id, assembly);
    }
    const sectionComponentMap = new Map(section.components.map((component) => [component.id, component]));

    for (const component of section.components) {
      const prefix = `${section.id}__${component.id}`;
      collectStructuralEntryTree(entries, registeredPrefixes, component, sectionComponentMap, sectionAssemblies, prefix);
    }
  }

  return entries.sort((a, b) => b.prefix.length - a.prefix.length);
}

function collectStructuralEntryTree(
  entries: SourceStructuralEntry[],
  registeredPrefixes: Set<string>,
  component: ComponentNode,
  componentMap: Map<string, ComponentNode>,
  assemblyMap: Map<string, ComponentAssemblyDefinition>,
  prefix: string,
  inherited: InheritedStructuralIntent = {},
  depth = 0
): void {
  if (depth > MAX_STRUCTURAL_ENTRY_DEPTH || registeredPrefixes.has(prefix)) {
    return;
  }
  registeredPrefixes.add(prefix);
  collectComponentEntry(entries, component, prefix, mergeInheritedIntent(inherited));

  if (component.type === "Instance") {
    const assembly = assemblyMap.get(component.placement.assembly);
    if (!assembly) {
      return;
    }
    // Nested scope mirrors expansion: assembly members resolve siblings
    // locally and cannot reference outer components or assemblies.
    const assemblyComponentMap = new Map(assembly.components.map((member) => [member.id, member]));
    const nestedInherited: InheritedStructuralIntent = {
      ...inherited,
      instanceIntent: mergeStructuralIntent(inherited.instanceIntent, component.structural),
    };
    for (const assemblyComponent of assembly.components) {
      collectStructuralEntryTree(
        entries,
        registeredPrefixes,
        assemblyComponent,
        assemblyComponentMap,
        NO_ASSEMBLIES,
        `${prefix}__${assemblyComponent.id}`,
        nestedInherited,
        depth + 1
      );
    }
    return;
  }

  if (component.type === "PathRepeat") {
    const assembly = assemblyMap.get(component.placement.source);
    if (!assembly) {
      return;
    }
    const assemblyComponentMap = new Map(assembly.components.map((member) => [member.id, member]));
    const nestedInherited: InheritedStructuralIntent = {
      ...inherited,
      repeatIntent: mergeStructuralIntent(inherited.repeatIntent, component.structural),
    };
    for (let index = 0; index < component.placement.count; index += 1) {
      for (const assemblyComponent of assembly.components) {
        collectStructuralEntryTree(
          entries,
          registeredPrefixes,
          assemblyComponent,
          assemblyComponentMap,
          NO_ASSEMBLIES,
          `${prefix}__${assembly.id}_${index}__${assemblyComponent.id}`,
          nestedInherited,
          depth + 1
        );
      }
    }
    return;
  }

  if (component.type === "Repeat" || component.type === "RadialRepeat") {
    const source = componentMap.get(component.placement.source);
    if (!source) {
      return;
    }
    // Linear repeats keep the original source placement at index 0, radial
    // clones replace it entirely; both share the clone id scheme.
    const startIndex = component.type === "Repeat" ? 1 : 0;
    const nestedInherited: InheritedStructuralIntent = {
      ...inherited,
      repeatIntent: mergeStructuralIntent(inherited.repeatIntent, component.structural),
    };
    for (let index = startIndex; index < component.placement.count; index += 1) {
      collectStructuralEntryTree(
        entries,
        registeredPrefixes,
        source,
        componentMap,
        assemblyMap,
        `${prefix}__${source.id}_${index}`,
        nestedInherited,
        depth + 1
      );
    }
  }
}

function mergeStructuralIntent(
  base?: ComponentStructuralIntent,
  override?: ComponentStructuralIntent
): ComponentStructuralIntent | undefined {
  if (!base && !override) {
    return undefined;
  }
  return { ...base, ...override };
}

function mergeInheritedIntent(inherited: InheritedStructuralIntent): ComponentStructuralIntent | undefined {
  return mergeStructuralIntent(inherited.repeatIntent, inherited.instanceIntent);
}

function collectComponentEntry(
  entries: SourceStructuralEntry[],
  component: ComponentNode,
  prefix: string,
  inheritedStructural?: ComponentStructuralIntent
): void {
  const selfStructural = defaultStructuralIntentForComponent(component);
  const structural = inheritedStructural
    ? {
        ...selfStructural,
        ...inheritedStructural,
        ...component.structural,
        supportPolicy: component.structural?.supportPolicy ?? inheritedStructural.supportPolicy ?? selfStructural.supportPolicy,
      }
    : selfStructural;

  entries.push({
    prefix,
    componentId: component.id,
    declaredInputs: (component.inputs?.length ?? 0) > 0,
    structural,
  });
}

function connectedToRoots(
  blocks: VoxelBlock[],
  blockMap: Map<string, VoxelBlock>,
  groundY: number,
  rootSourceNodeIdPrefixes: string[],
  rootBoxes: SupportAnalysisBounds[]
): Set<string> {
  const connected = new Set<string>();
  const queue: Vec3[] = [];

  for (const block of blocks) {
    if (isSupportRoot(block, groundY, rootSourceNodeIdPrefixes, rootBoxes)) {
      const key = posKey(block.pos);
      connected.add(key);
      queue.push(block.pos);
    }
  }

  for (let index = 0; index < queue.length; index++) {
    const pos = queue[index];
    for (const neighbor of neighbors(pos)) {
      const key = posKey(neighbor);
      if (!connected.has(key) && blockMap.has(key)) {
        connected.add(key);
        queue.push(neighbor);
      }
    }
  }

  return connected;
}

function isSupportRoot(
  block: VoxelBlock,
  groundY: number,
  rootSourceNodeIdPrefixes: string[],
  rootBoxes: SupportAnalysisBounds[]
): boolean {
  return block.pos[1] <= groundY ||
    rootSourceNodeIdPrefixes.some((prefix) => block.sourceNodeId?.startsWith(prefix)) ||
    rootBoxes.some((box) => containsPos(box, block.pos));
}

function groupsToDiagnostics(
  groups: SourceGroup[],
  code: SupportDiagnosticCode,
  message: string,
  repairHint: string,
  options: InternalSupportAnalysisOptions
): SupportDiagnostic[] {
  const diagnostics: SupportDiagnostic[] = [];
  const minDiagnosticBlocks = options.minDiagnosticBlocks ?? 1;
  for (const group of groups) {
    if (group.blocks.length < minDiagnosticBlocks) {
      continue;
    }
    const structural = structuralForSource(group.sourceNodeId, options.sourceStructural ?? []);
    if ((structural.supportPolicy === "decorative" || structural.supportPolicy === "may_float") && !options.includeAllowed) {
      continue;
    }

    const allowed = structural.supportPolicy === "decorative" || structural.supportPolicy === "may_float";
    diagnostics.push({
      severity: "warning",
      stage: "support-analysis",
      code: allowed ? `ALLOWED_${code}` : code,
      message: allowed ? `${message} This is allowed by structural intent.` : message,
      sourceNodeId: group.sourceNodeId,
      componentId: structural.componentId,
      count: group.blocks.length,
      bounds: group.bounds,
      supportPolicy: structural.supportPolicy,
      supportRoots: structural.supportRoots,
      maxCantilever: structural.maxCantilever,
      repairHint: allowed ? "No repair needed unless the visual result is unintended." : repairHint,
    });
  }
  return diagnostics;
}

function summarizeSources(
  blocks: VoxelBlock[],
  verticalUnsupported: VoxelBlock[],
  disconnected: VoxelBlock[],
  largeCantilever: VoxelBlock[],
  ignoredSourceNodeIdPrefixes: string[],
  options: InternalSupportAnalysisOptions
): SupportSourceSummary[] {
  const verticalUnsupportedCounts = countBySource(verticalUnsupported);
  const disconnectedCounts = countBySource(disconnected);
  const largeCantileverCounts = countBySource(largeCantilever);

  return groupBySource(blocks, ignoredSourceNodeIdPrefixes).map((group) => {
    const structural = structuralForSource(group.sourceNodeId, options.sourceStructural ?? []);
    return {
      sourceNodeId: group.sourceNodeId,
      componentId: structural.componentId,
      count: group.blocks.length,
      bounds: group.bounds,
      supportPolicy: structural.supportPolicy,
      supportRoots: structural.supportRoots,
      maxCantilever: structural.maxCantilever,
      verticalUnsupportedBlocks: verticalUnsupportedCounts.get(group.sourceNodeId) ?? 0,
      disconnectedBlocks: disconnectedCounts.get(group.sourceNodeId) ?? 0,
      largeCantileverBlocks: largeCantileverCounts.get(group.sourceNodeId) ?? 0,
    };
  });
}

function countBySource(blocks: VoxelBlock[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    const sourceNodeId = block.sourceNodeId ?? "unknown";
    counts.set(sourceNodeId, (counts.get(sourceNodeId) ?? 0) + 1);
  }
  return counts;
}

function findMinimalAttachmentDiagnostics(
  blocks: VoxelBlock[],
  blockMap: Map<string, VoxelBlock>,
  connected: Set<string>,
  options: InternalSupportAnalysisOptions
): SupportDiagnostic[] {
  const sourceStructural = options.sourceStructural ?? [];
  const strictEntries = sourceStructural.filter((entry) => (
    entry.declaredInputs &&
    (entry.structural.supportPolicy === "must_connect_to_input" || entry.structural.supportPolicy === "must_connect_to_ground")
  ));
  if (strictEntries.length === 0) {
    return [];
  }

  const minContacts = options.minAttachmentContacts ?? 2;
  const ignoredSourceNodeIdPrefixes = options.ignoredSourceNodeIdPrefixes ?? [];
  const ownerByPos = new Map<string, string>();
  for (const block of blocks) {
    ownerByPos.set(posKey(block.pos), resolveOwnerPrefix(block.sourceNodeId ?? "unknown", sourceStructural));
  }

  interface OwnerStats {
    totalBlocks: number;
    connectedBlocks: number;
    bounds: SupportAnalysisBounds;
  }
  const statsByOwner = new Map<string, OwnerStats>();
  for (const block of blocks) {
    const key = posKey(block.pos);
    const owner = ownerByPos.get(key);
    if (owner === undefined) {
      continue;
    }
    const stats = statsByOwner.get(owner) ?? {
      totalBlocks: 0,
      connectedBlocks: 0,
      bounds: { min: [...block.pos] as Vec3, max: [...block.pos] as Vec3 },
    };
    stats.totalBlocks += 1;
    if (connected.has(key)) {
      stats.connectedBlocks += 1;
    }
    for (let index = 0; index < 3; index++) {
      stats.bounds.min[index] = Math.min(stats.bounds.min[index], block.pos[index]);
      stats.bounds.max[index] = Math.max(stats.bounds.max[index], block.pos[index]);
    }
    statsByOwner.set(owner, stats);
  }

  const contactCounts = new Map<string, number>();
  for (const block of blocks) {
    const [x, y, z] = block.pos;
    const owner = ownerByPos.get(posKey(block.pos));
    if (owner === undefined) {
      continue;
    }
    for (const neighbor of [[x + 1, y, z], [x, y + 1, z], [x, y, z + 1]] as Vec3[]) {
      const neighborKey = posKey(neighbor);
      if (!blockMap.has(neighborKey)) {
        continue;
      }
      const neighborOwner = ownerByPos.get(neighborKey);
      if (neighborOwner === undefined || neighborOwner === owner) {
        continue;
      }
      contactCounts.set(owner, (contactCounts.get(owner) ?? 0) + 1);
      contactCounts.set(neighborOwner, (contactCounts.get(neighborOwner) ?? 0) + 1);
    }
  }

  const diagnostics: SupportDiagnostic[] = [];
  for (const entry of strictEntries) {
    const stats = statsByOwner.get(entry.prefix);
    if (!stats || stats.connectedBlocks === 0) {
      continue;
    }
    if (ignoredSourceNodeIdPrefixes.some((prefix) => entry.prefix.startsWith(prefix))) {
      continue;
    }

    const contacts = contactCounts.get(entry.prefix) ?? 0;
    if (contacts >= minContacts) {
      continue;
    }

    diagnostics.push({
      severity: "warning",
      stage: "support-analysis",
      code: "MINIMAL_ATTACHMENT",
      message: `Component "${entry.componentId}" attaches to other components through ${contacts} shared face${contacts === 1 ? "" : "s"}.`,
      repairHint: "Widen the bearing surface or add posts/brackets under roof frames and eaves, or set explicit structural intent if this thin attachment is intentional.",
      sourceNodeId: entry.prefix,
      componentId: entry.componentId,
      count: stats.totalBlocks,
      bounds: stats.bounds,
      supportPolicy: entry.structural.supportPolicy,
      supportRoots: entry.structural.supportRoots,
      maxCantilever: entry.structural.maxCantilever,
    });
  }

  return diagnostics;
}

function resolveOwnerPrefix(sourceNodeId: string, entries: SourceStructuralEntry[]): string {
  const entry = entries.find((candidate) => sourceNodeId === candidate.prefix || sourceNodeId.startsWith(`${candidate.prefix}__`));
  return entry ? entry.prefix : sourceNodeId;
}

function findLargeCantileverBlocks(
  candidates: VoxelBlock[],
  blockMap: Map<string, VoxelBlock>,
  groundY: number,
  options: InternalSupportAnalysisOptions
): VoxelBlock[] {
  const result: VoxelBlock[] = [];
  for (const block of candidates) {
    const structural = structuralForSource(block.sourceNodeId ?? "unknown", options.sourceStructural ?? []);
    const maxCantilever = structural.maxCantilever ?? options.maxCantilever;
    if (maxCantilever === undefined) {
      continue;
    }
    if (distanceToSameLevelVerticalSupport(block.pos, blockMap, groundY, maxCantilever) > maxCantilever) {
      result.push(block);
    }
  }
  return result;
}

function distanceToSameLevelVerticalSupport(
  start: Vec3,
  blockMap: Map<string, VoxelBlock>,
  groundY: number,
  maxDistance: number
): number {
  const visited = new Set<string>([posKey(start)]);
  const queue: Array<{ pos: Vec3; distance: number }> = [{ pos: start, distance: 0 }];
  const y = start[1];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (hasVerticalSupport(current.pos, blockMap, groundY)) {
      return current.distance;
    }
    if (current.distance > maxDistance) {
      continue;
    }

    const [x, , z] = current.pos;
    for (const next of [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]] as Vec3[]) {
      const key = posKey(next);
      if (visited.has(key) || !blockMap.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({ pos: next, distance: current.distance + 1 });
    }
  }

  return Number.POSITIVE_INFINITY;
}

function hasVerticalSupport(pos: Vec3, blockMap: Map<string, VoxelBlock>, groundY: number): boolean {
  if (pos[1] <= groundY) {
    return true;
  }
  return blockMap.has(posKey([pos[0], pos[1] - 1, pos[2]]));
}

function structuralForSource(
  sourceNodeId: string,
  entries: SourceStructuralEntry[]
): SourceStructuralEntry["structural"] & { componentId?: string } {
  const entry = entries.find((candidate) => sourceNodeId === candidate.prefix || sourceNodeId.startsWith(`${candidate.prefix}__`));
  if (!entry) {
    return { supportPolicy: "must_connect_to_input" };
  }
  return { ...entry.structural, componentId: entry.componentId };
}

function groupBySource(blocks: VoxelBlock[], ignoredSourceNodeIdPrefixes: string[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const block of blocks) {
    const sourceNodeId = block.sourceNodeId ?? "unknown";
    if (ignoredSourceNodeIdPrefixes.some((prefix) => sourceNodeId.startsWith(prefix))) {
      continue;
    }
    const group = groups.get(sourceNodeId) ?? {
      sourceNodeId,
      blocks: [],
      bounds: { min: [...block.pos] as Vec3, max: [...block.pos] as Vec3 },
    };
    group.blocks.push(block);
    for (let index = 0; index < 3; index++) {
      group.bounds.min[index] = Math.min(group.bounds.min[index], block.pos[index]);
      group.bounds.max[index] = Math.max(group.bounds.max[index], block.pos[index]);
    }
    groups.set(sourceNodeId, group);
  }
  return [...groups.values()].sort((a, b) => b.blocks.length - a.blocks.length);
}

function limitDiagnostics(diagnostics: SupportDiagnostic[], maxPerCode: number, maxPerSource?: number): SupportDiagnostic[] {
  const counts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  return diagnostics.filter((diagnostic) => {
    const count = counts.get(diagnostic.code) ?? 0;
    if (count >= maxPerCode) {
      return false;
    }

    const sourceNodeId = diagnostic.sourceNodeId ?? "unknown";
    const sourceCount = sourceCounts.get(sourceNodeId) ?? 0;
    if (maxPerSource !== undefined && sourceCount >= maxPerSource) {
      return false;
    }

    counts.set(diagnostic.code, count + 1);
    sourceCounts.set(sourceNodeId, sourceCount + 1);
    return true;
  });
}

function containsPos(bounds: SupportAnalysisBounds, pos: Vec3): boolean {
  return pos.every((value, index) => value >= bounds.min[index] && value <= bounds.max[index]);
}

function neighbors(pos: Vec3): Vec3[] {
  const [x, y, z] = pos;
  return [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y + 1, z],
    [x, y - 1, z],
    [x, y, z + 1],
    [x, y, z - 1],
  ];
}

function posKey(pos: Vec3): string {
  return `${pos[0]},${pos[1]},${pos[2]}`;
}

function parentSourceId(sourceNodeId: string): string | null {
  const lastSep = sourceNodeId.lastIndexOf("__");
  return lastSep > 0 ? sourceNodeId.slice(0, lastSep) : null;
}

function collectConnectedAncestorPrefixes(blocks: VoxelBlock[], connected: Set<string>): Set<string> {
  const prefixes = new Set<string>();
  for (const block of blocks) {
    if (!connected.has(posKey(block.pos))) continue;
    const sourceNodeId = block.sourceNodeId ?? "unknown";
    prefixes.add(sourceNodeId);
    for (let current = sourceNodeId; current.includes("__");) {
      const parent = parentSourceId(current);
      if (!parent) break;
      prefixes.add(parent);
      current = parent;
    }
  }
  return prefixes;
}

function hasConnectedKnownAncestor(sourceNodeId: string, knownPrefixes: Set<string>, connectedPrefixes: Set<string>): boolean {
  const sepCount = (sourceNodeId.match(/__/g) || []).length;
  if (sepCount < 2) return false;
  if (connectedPrefixes.has(sourceNodeId)) return true;
  for (let current = sourceNodeId; current.includes("__");) {
    const parent = parentSourceId(current);
    if (!parent) return false;
    if (knownPrefixes.has(parent)) {
      return connectedPrefixes.has(parent);
    }
    current = parent;
  }
  return false;
}
