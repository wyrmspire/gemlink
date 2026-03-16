import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  X,
  Copy,
  GripHorizontal,
  Image as ImageIcon,
  Film,
  Mic,
  ChevronDown,
  ArrowRight,
  Maximize2,
  AlertTriangle,
} from "lucide-react";
import TransitionPicker from "./TransitionPicker";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Slide {
  id: string;
  jobId: string;
  thumbnail: string | null;
  jobType?: "image" | "video" | "voice" | "music";
  duration: number;
  transition: string;
  kenBurns: boolean;
  kenBurnsDirection?: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
  textOverlay?: {
    text: string;
    position: "top" | "center" | "bottom";
  };
  aspectRatio?: string;
}

interface SlideTimelineProps {
  slides: Slide[];
  onReorder: (slides: Slide[]) => void;
  onUpdateSlide: (id: string, patch: Partial<Slide>) => void;
  onDeleteSlide: (id: string) => void;
  onDuplicateSlide: (id: string) => void;
  onAddSlide: () => void;
  targetAspectRatio?: string;
}

// ─── Individual sortable slide card ──────────────────────────────────────────

interface SortableSlideCardProps {
  slide: Slide;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<Slide>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isLast: boolean;
  targetAspectRatio?: string;
}

function SortableSlideCard({
  slide,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onDuplicate,
  isLast,
  targetAspectRatio,
}: SortableSlideCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  function TypeIcon() {
    if (slide.jobType === "video") return <Film className="w-5 h-5 text-emerald-400" />;
    if (slide.jobType === "voice") return <Mic className="w-5 h-5 text-amber-400" />;
    return <ImageIcon className="w-5 h-5 text-indigo-400" />;
  }

  return (
    <div className="flex items-start gap-0">
      {/* Slide card */}
      <div ref={setNodeRef} style={style} className="flex flex-col items-center">
        <div
          className={`group relative w-[100px] rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
            isExpanded ? "border-indigo-500" : "border-zinc-800 hover:border-zinc-600"
          } bg-zinc-900`}
          style={{ height: "80px" }}
          onClick={onToggleExpand}
        >
          {/* Thumbnail */}
          {slide.thumbnail ? (
            slide.thumbnail.endsWith(".mp4") ? (
              <video src={slide.thumbnail} className="w-full h-full object-cover" />
            ) : (
              <img src={slide.thumbnail} alt={`Slide ${index + 1}`} className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
              <TypeIcon />
            </div>
          )}

          {/* Duration badge */}
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {slide.duration}s
          </div>

          {/* Slide number */}
          <div className="absolute top-1 left-1 bg-black/70 text-zinc-300 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1">
            {index + 1}
            {slide.jobType === "video" && (
              <span className="bg-indigo-600 text-[8px] font-black px-1 rounded-sm border border-indigo-400 leading-tight">
                VID
              </span>
            )}
          </div>

          {/* Aspect Ratio Mismatch Warning */}
          {targetAspectRatio && slide.aspectRatio && 
           slide.aspectRatio.replace(":", "x") !== targetAspectRatio.replace(":", "x") && (
            <div className="absolute top-1 right-1 z-10" title={`Mismatch: Slide is ${slide.aspectRatio}, Composition is ${targetAspectRatio}`}>
              <div className="bg-amber-500 rounded-sm p-0.5 shadow-lg border border-amber-400">
                <AlertTriangle className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          )}

          {/* KenBurns badge */}
          {slide.kenBurns && (
            <div className={`absolute top-1 right-1 ${targetAspectRatio && slide.aspectRatio && slide.aspectRatio.replace(":", "x") !== targetAspectRatio.replace(":", "x") ? "top-5" : ""}`}>
              <Maximize2 className="w-3 h-3 text-indigo-300 drop-shadow" />
            </div>
          )}

          {/* Duplicate button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="absolute top-0.5 left-0.5 hidden group-hover:flex w-5 h-5 bg-zinc-700 hover:bg-indigo-600 rounded text-white items-center justify-center transition-colors"
            title="Duplicate slide"
          >
            <Copy className="w-3 h-3" />
          </button>

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-0.5 right-0.5 hidden group-hover:flex w-5 h-5 bg-red-600 hover:bg-red-500 rounded text-white items-center justify-center transition-colors"
          >
            <X className="w-3 h-3" />
          </button>

          {/* Expand indicator */}
          <div className="absolute bottom-1 left-1.5">
            <ChevronDown
              className={`w-3.5 h-3.5 text-white/60 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>

        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-zinc-700 hover:text-zinc-400 transition-colors"
          title="Drag to reorder"
        >
          <GripHorizontal className="w-5 h-5" />
        </div>
      </div>

      {/* Transition connector between slides */}
      {!isLast && (
        <div className="flex items-center self-start mt-4 px-1">
          <ArrowRight className="w-4 h-4 text-zinc-700" />
          <span className="text-[9px] text-zinc-700 ml-0.5 max-w-[36px] truncate leading-tight">
            {slide.transition}
          </span>
        </div>
      )}

      {/* Expanded settings panel (shown below via parent) */}
    </div>
  );
}

// ─── Expanded settings panel ─────────────────────────────────────────────────

interface SlidePanelProps {
  slide: Slide;
  onUpdate: (patch: Partial<Slide>) => void;
}

function SlideSettingsPanel({ slide, onUpdate }: SlidePanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 p-4 bg-zinc-950/80 border border-zinc-800 rounded-2xl overflow-hidden space-y-4"
    >
      {/* Duration slider + presets */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs uppercase tracking-wider text-zinc-500">Duration</label>
          <div className="flex items-center gap-1">
            {[2, 3, 5].map((d) => (
              <button
                key={d}
                onClick={() => onUpdate({ duration: d })}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  slide.duration === d
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500"
                }`}
              >
                {d}s
              </button>
            ))}
            <span className="text-xs text-zinc-300 font-mono ml-1">{slide.duration}s</span>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={slide.duration}
          onChange={(e) => onUpdate({ duration: Number(e.target.value) })}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-[10px] text-zinc-700 mt-0.5">
          <span>1s</span>
          <span>10s</span>
        </div>
      </div>

      {/* Transition picker */}
      <TransitionPicker
        value={slide.transition}
        onChange={(t) => onUpdate({ transition: t })}
      />

      {/* Ken Burns toggle + direction */}
      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={slide.kenBurns}
              onChange={(e) => onUpdate({ kenBurns: e.target.checked })}
              className="sr-only"
            />
            <div
              className={`w-10 h-5 rounded-full transition-colors ${
                slide.kenBurns ? "bg-indigo-600" : "bg-zinc-700"
              }`}
            />
            <div
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                slide.kenBurns ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </div>
          <div>
            <span className="text-sm font-medium text-zinc-200">Ken Burns effect</span>
            <p className="text-[11px] text-zinc-600">Slow zoom/pan on static image</p>
          </div>
        </label>
        {slide.kenBurns && (
          <div className="flex gap-1.5 pl-[52px]">
            {(["zoom-in", "zoom-out", "pan-left", "pan-right"] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => onUpdate({ kenBurnsDirection: dir })}
                className={`text-[10px] px-2 py-1 rounded-lg border capitalize transition-colors ${
                  (slide.kenBurnsDirection ?? "zoom-in") === dir
                    ? "bg-indigo-600/30 border-indigo-500/60 text-indigo-300"
                    : "border-zinc-800 text-zinc-500 hover:text-white"
                }`}
              >
                {dir.replace("-", " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text overlay */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">
          Text Overlay (optional)
        </label>
        <input
          type="text"
          value={slide.textOverlay?.text ?? ""}
          onChange={(e) =>
            onUpdate({
              textOverlay: e.target.value.trim()
                ? {
                    text: e.target.value,
                    position: slide.textOverlay?.position ?? "bottom",
                  }
                : undefined,
            })
          }
          placeholder="Optional title or caption for this slide…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {slide.textOverlay?.text && (
          <div className="flex gap-2 mt-2">
            {(["top", "center", "bottom"] as const).map((pos) => (
              <button
                key={pos}
                onClick={() =>
                  onUpdate({
                    textOverlay: { text: slide.textOverlay!.text, position: pos },
                  })
                }
                className={`flex-1 py-1.5 rounded-lg border text-xs capitalize transition-colors ${
                  (slide.textOverlay?.position ?? "bottom") === pos
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-zinc-800 text-zinc-500 hover:text-white"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SlideTimeline({
  slides,
  onReorder,
  onUpdateSlide,
  onDeleteSlide,
  onDuplicateSlide,
  onAddSlide,
  targetAspectRatio,
}: SlideTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = slides.findIndex((s) => s.id === active.id);
      const newIndex = slides.findIndex((s) => s.id === over.id);
      onReorder(arrayMove(slides, oldIndex, newIndex));
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-600">
        <ImageIcon className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm text-zinc-500 mb-1">No slides yet</p>
        <p className="text-xs text-zinc-700 mb-4">
          Click items in the Media Picker to add slides
        </p>
        <button
          onClick={onAddSlide}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add First Slide
        </button>
      </div>
    );
  }

  const expandedSlide = slides.find((s) => s.id === expandedId);

  return (
    <div className="space-y-3">
      {/* Horizontal scroll timeline */}
      <div className="overflow-x-auto pb-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={slides.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex items-start gap-0 w-max min-w-full p-1">
              {slides.map((slide, i) => (
                <SortableSlideCard
                  key={slide.id}
                  slide={slide}
                  index={i}
                  isExpanded={expandedId === slide.id}
                  onToggleExpand={() => toggleExpand(slide.id)}
                  onUpdate={(patch) => onUpdateSlide(slide.id, patch)}
                  onDelete={() => {
                    onDeleteSlide(slide.id);
                    if (expandedId === slide.id) setExpandedId(null);
                  }}
                  onDuplicate={() => onDuplicateSlide(slide.id)}
                  isLast={i === slides.length - 1}
                  targetAspectRatio={targetAspectRatio}
                />
              ))}

              {/* Add button */}
              <button
                onClick={onAddSlide}
                className="self-start mt-0 ml-2 w-[52px] h-[80px] flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-700 hover:border-indigo-500 text-zinc-600 hover:text-indigo-400 transition-all"
              >
                <Plus className="w-5 h-5" />
                <span className="text-[9px] font-medium uppercase tracking-wider">Add</span>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Expanded settings panel */}
      <AnimatePresence>
        {expandedSlide && (
          <SlideSettingsPanel
            key={expandedSlide.id}
            slide={expandedSlide}
            onUpdate={(patch) => onUpdateSlide(expandedSlide.id, patch)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
