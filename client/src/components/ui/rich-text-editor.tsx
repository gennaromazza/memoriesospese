import { CKEditor } from '@ckeditor/ckeditor5-react';
import { ClassicEditor, Bold, Essentials, Italic, Paragraph, Undo, List, Link, Heading } from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function RichTextEditor({ 
  value = '', 
  onChange, 
  placeholder = 'Scrivi qui...', 
  disabled = false,
  className = ''
}: RichTextEditorProps) {
  return (
    <div className={`border rounded-md ${disabled ? 'opacity-50' : ''} ${className}`}>
      <CKEditor
        editor={ClassicEditor}
        config={{
          plugins: [Essentials, Bold, Italic, Paragraph, Undo, List, Link, Heading],
          toolbar: ['undo', 'redo', '|', 'heading', '|', 'bold', 'italic', 'link', '|', 'bulletedList', 'numberedList'],
          placeholder,
        }}
        data={value}
        onChange={(event, editor) => {
          const data = editor.getData();
          onChange?.(data);
        }}
        disabled={disabled}
      />
    </div>
  );
}
