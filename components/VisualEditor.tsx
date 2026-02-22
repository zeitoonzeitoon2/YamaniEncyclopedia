'use client'

import React, { useEffect, useImperativeHandle, forwardRef } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { useTranslations } from 'next-intl'
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Heading1, 
  Heading2, 
  Heading3,
  Undo,
  Redo,
  Link as LinkIcon,
  BookOpen,
  Library
} from 'lucide-react'

interface VisualEditorProps {
  content: string
  onChange: (markdown: string) => void
  placeholder?: string
}

export interface VisualEditorRef {
  insertText: (text: string) => void
  getMarkdown: () => string
}

const MenuButton = ({ 
  onClick, 
  isActive = false, 
  disabled = false, 
  children, 
  title 
}: { 
  onClick: () => void, 
  isActive?: boolean, 
  disabled?: boolean, 
  children: React.ReactNode,
  title?: string
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-2 rounded transition-colors ${
      isActive 
        ? 'bg-amber-500 text-white' 
        : 'text-gray-400 hover:bg-stone-700 hover:text-amber-200'
    } disabled:opacity-50`}
  >
    {children}
  </button>
)
MenuButton.displayName = 'MenuButton'

const VisualEditor = forwardRef<VisualEditorRef, VisualEditorProps>(({ content, onChange, placeholder }, ref) => {
  const t = useTranslations('visualEditor')
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-amber-500 pl-4 my-4 italic',
          },
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-400 underline',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || t('placeholder'),
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: false,
        breaks: true,
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      // Get markdown output
      const markdown = (editor.storage as any).markdown.getMarkdown()
      onChange(markdown)
    },
    editorProps: {
      attributes: {
        class: 'article-content-body focus:outline-none min-h-full p-4 text-site-text',
        dir: 'rtl',
      },
    },
  })

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      editor?.chain().focus().insertContent(text).run()
    },
    getMarkdown: () => {
      return (editor?.storage as any)?.markdown?.getMarkdown() || ''
    }
  }))

  // Update editor content if it changes from outside (e.g. initial load)
  useEffect(() => {
    if (editor && content !== (editor.storage as any).markdown.getMarkdown()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  if (!editor) return null

  const addLink = () => {
    const url = window.prompt('URL:')
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    } else if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    }
  }

  return (
    <div className="flex flex-col border border-gray-600 rounded-lg overflow-hidden bg-site-bg h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-600 bg-site-secondary">
        <MenuButton 
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <Bold size={18} />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic size={18} />
        </MenuButton>
        
        <div className="w-px h-6 bg-gray-600 mx-1" />

        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading1 size={18} />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading2 size={18} />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          isActive={editor.isActive('heading', { level: 4 })}
          title="Heading 4"
        >
          <Heading3 size={18} />
        </MenuButton>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <MenuButton 
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet List"
        >
          <List size={18} />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Ordered List"
        >
          <ListOrdered size={18} />
        </MenuButton>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <MenuButton 
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Quote"
        >
          <Quote size={18} />
        </MenuButton>

        {/* Custom Ayah and Quote Buttons */}
        <MenuButton 
          onClick={() => {
            editor.chain().focus().insertContent('> !ayah \n').run()
          }}
          title={t('addAyah')}
        >
          <BookOpen size={18} />
        </MenuButton>
        <MenuButton 
          onClick={() => {
            editor.chain().focus().insertContent('> !quote: \n').run()
          }}
          title={t('addQuote')}
        >
          <Library size={18} />
        </MenuButton>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <MenuButton onClick={addLink} isActive={editor.isActive('link')} title="Link">
          <LinkIcon size={18} />
        </MenuButton>

        <div className="flex-1" />

        <MenuButton 
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo size={18} />
        </MenuButton>
        <MenuButton 
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo size={18} />
        </MenuButton>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      
      {/* Help Footer */}
      <div className="p-2 border-t border-gray-600 bg-stone-900/50 flex justify-between items-center text-[10px] text-gray-500">
        <span>{t('active')}</span>
        <div className="flex gap-2">
          <span>{t('boldShortcut')}</span>
          <span>{t('italicShortcut')}</span>
          <span>{t('orderedListShortcut')}</span>
        </div>
      </div>
    </div>
  )
})

VisualEditor.displayName = 'VisualEditor'

export default VisualEditor
