import React, { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

const QRCodeDisplay = ({ qrCode }) => {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (qrCode && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrCode, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
    }
  }, [qrCode])

  return (
    <div className="qr-code">
      <h3>📱 Escaneie o QR Code</h3>
      <div className="qr-container">
        <canvas ref={canvasRef} />
      </div>
      <p className="qr-instructions">
        1. Abra o WhatsApp no seu celular<br/>
        2. Vá em Configurações → WhatsApp Web<br/>
        3. Aponte a câmera para o QR Code acima
      </p>
    </div>
  )
}

export default QRCodeDisplay