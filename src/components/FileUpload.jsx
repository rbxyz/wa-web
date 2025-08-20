import React, { useState, useRef } from 'react'

const FileUpload = ({ onFilesProcessed, onStatusUpdate }) => {
  const [files, setFiles] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileSelect = (event) => {
    const selectedFiles = Array.from(event.target.files)
    const pdfFiles = selectedFiles.filter(file => 
      file.name.endsWith('.pdf') && 
      file.name.startsWith('ESPELHO ')
    )
    
    setFiles(pdfFiles)
    onStatusUpdate(` ${pdfFiles.length} arquivos PDF selecionados`)
  }

  const processFiles = async () => {
    if (files.length === 0) {
      onStatusUpdate('❌ Nenhum arquivo para processar')
      return
    }

    setIsProcessing(true)
    onStatusUpdate('🔄 Processando arquivos...')

    try {
      const processedFiles = files.map(file => {
        // Remover 'ESPELHO ' e '.pdf'
        const code = file.name.replace('ESPELHO ', '').replace('.pdf', '')
        return {
          file,
          code,
          filename: file.name
        }
      })

      onStatusUpdate(`✅ Processados ${processedFiles.length} arquivos`)
      onFilesProcessed(processedFiles)
      
    } catch (error) {
      onStatusUpdate(`❌ Erro ao processar: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const clearFiles = () => {
    setFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onStatusUpdate('🗑️ Arquivos removidos')
  }

  return (
    <div className="file-upload">
      <h3> Upload de Arquivos PDF</h3>
      
      <div className="upload-area">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileSelect}
          className="file-input"
        />
        <p className="upload-hint">
          Selecione arquivos PDF que começam com "ESPELHO "
        </p>
      </div>

      {files.length > 0 && (
        <div className="files-list">
          <h4>Arquivos selecionados ({files.length}):</h4>
          <ul>
            {files.map((file, index) => (
              <li key={index}>
                📄 {file.name} → Código: {file.name.replace('ESPELHO ', '').replace('.pdf', '')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        <button 
          onClick={processFiles}
          disabled={files.length === 0 || isProcessing}
          className="btn btn-primary"
        >
          {isProcessing ? '🔄 Processando...' : '⚙️ Processar Arquivos'}
        </button>
        
        <button 
          onClick={clearFiles}
          disabled={files.length === 0}
          className="btn btn-secondary"
        >
          ️ Limpar
        </button>
      </div>
    </div>
  )
}

export default FileUpload
