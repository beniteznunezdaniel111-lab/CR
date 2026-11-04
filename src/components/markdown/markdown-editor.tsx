"use client";

import { Markdown } from "@tiptap/markdown";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  Redo2Icon,
  Undo2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/**
 * Editor visual (tipo procesador de texto) que lee y guarda Markdown.
 * Las personas de RRHH no ven la sintaxis; la app almacena Markdown portable.
 */
export function MarkdownEditor({
  markdown,
  editable = true,
  onChange,
  onReady,
  ariaLabel,
  className,
}: {
  markdown: string;
  editable?: boolean;
  onChange?: (markdown: string) => void;
  onReady?: (editor: Editor) => void;
  ariaLabel: string;
  className?: string;
}) {
  // Refs: TipTap captura las opciones al crear el editor; así siempre se usa la última versión.
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
  });

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false, code: false, codeBlock: false }), Markdown],
    content: markdown,
    contentType: "markdown",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
        class: cn(
          "min-h-80 rounded-b-md border border-t-0 px-4 py-3 text-sm leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "[&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_p]:my-2",
          "[&_li_p]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
          !editable && "bg-muted/40",
        ),
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current?.(current.getMarkdown()),
  });

  useEffect(() => {
    if (editor) onReadyRef.current?.(editor);
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={className}>
      <Toolbar editor={editor} disabled={!editable} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const t = useTranslations("editor");
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            h2: current.isActive("heading", { level: 2 }),
            h3: current.isActive("heading", { level: 3 }),
            bullet: current.isActive("bulletList"),
            ordered: current.isActive("orderedList"),
            canUndo: current.can().undo(),
            canRedo: current.can().redo(),
          }
        : null,
  });

  const items = [
    {
      key: "bold",
      icon: BoldIcon,
      active: state?.bold,
      run: (e: Editor) => e.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      icon: ItalicIcon,
      active: state?.italic,
      run: (e: Editor) => e.chain().focus().toggleItalic().run(),
    },
    {
      key: "heading2",
      icon: Heading2Icon,
      active: state?.h2,
      run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "heading3",
      icon: Heading3Icon,
      active: state?.h3,
      run: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      key: "bulletList",
      icon: ListIcon,
      active: state?.bullet,
      run: (e: Editor) => e.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      icon: ListOrderedIcon,
      active: state?.ordered,
      run: (e: Editor) => e.chain().focus().toggleOrderedList().run(),
    },
  ] as const;

  return (
    <div
      role="toolbar"
      aria-label={t("toolbar")}
      className="flex flex-wrap items-center gap-1 rounded-t-md border bg-muted/40 px-2 py-1"
    >
      {items.map(({ key, icon: Icon, active, run }) => (
        <Toggle
          key={key}
          size="sm"
          pressed={Boolean(active)}
          disabled={disabled || !editor}
          aria-label={t(key)}
          onPressedChange={() => editor && run(editor)}
        >
          <Icon aria-hidden />
        </Toggle>
      ))}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Toggle
        size="sm"
        pressed={false}
        disabled={disabled || !state?.canUndo}
        aria-label={t("undo")}
        onPressedChange={() => editor?.chain().focus().undo().run()}
      >
        <Undo2Icon aria-hidden />
      </Toggle>
      <Toggle
        size="sm"
        pressed={false}
        disabled={disabled || !state?.canRedo}
        aria-label={t("redo")}
        onPressedChange={() => editor?.chain().focus().redo().run()}
      >
        <Redo2Icon aria-hidden />
      </Toggle>
    </div>
  );
}
