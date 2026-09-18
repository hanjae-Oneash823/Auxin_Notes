import React from 'react';
import ReactDOM from 'react-dom/client';
import { FileSearcherOverlay } from './FileSearcherOverlay';
import '../design/fileSearcherGlobal.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <FileSearcherOverlay />
  </React.StrictMode>,
);
