import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Icon } from './Icon'
import { STRINGS } from '../lib/constants'
import { encodeSharedPlanUrl, type SharedPlanPayload } from '../lib/share'

/**
 * 計画カードの共有パネル（P2-W2）。
 * 開いたときに共有URL（#p=圧縮データ）とQRを生成する。
 * Web Share API があれば共有シート、無ければクリップボードコピーにフォールバック。
 * payload は親（PlanCard）で useMemo 済みの参照を渡すこと（毎レンダー新規だと再生成が走る）。
 */
export function SharePanel({ payload }: { payload: SharedPlanPayload }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 開閉時のフォーカス移動（開く→パネル、閉じる→開くボタン）。初回マウントでは動かさない。
  const openBtnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (prevOpenRef.current === open) return
    prevOpenRef.current = open
    if (open) panelRef.current?.focus()
    else openBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    let alive = true
    const u = encodeSharedPlanUrl(payload)
    setUrl(u)
    setCopied(false)
    // 誤り訂正M・余白2は一般的なスキャン耐性の目安
    QRCode.toDataURL(u, { errorCorrectionLevel: 'M', margin: 2, scale: 5 })
      .then((dataUrl) => {
        if (alive) setQr(dataUrl)
      })
      .catch((e) => console.error('QR generation failed:', e))
    return () => {
      alive = false
    }
  }, [open, payload])

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: STRINGS.plan.title, url })
        return
      }
    } catch (e) {
      // 共有シートのキャンセルは正常系
      if ((e as DOMException)?.name === 'AbortError') return
      console.error('share failed:', e)
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch (e) {
      console.error('clipboard failed:', e)
    }
  }

  if (!open) {
    return (
      <div className="next-cta">
        <button ref={openBtnRef} className="btn big outline" onClick={() => setOpen(true)}>
          <Icon name="chevron-right" size={16} /> {STRINGS.share.openBtn}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="share-panel"
      role="group"
      aria-label={STRINGS.share.title}
    >
      <div className="es-title">{STRINGS.share.title}</div>
      <p className="share-lead">{STRINGS.share.lead}</p>

      {qr && (
        <div className="share-qr">
          <img src={qr} alt={STRINGS.share.qrAlt} width={220} height={220} />
        </div>
      )}

      <div className="share-actions">
        <button className="btn" onClick={share}>
          {STRINGS.share.shareBtn}
        </button>
        {qr && (
          <a className="btn outline" download="yata-guide-plan-qr.png" href={qr}>
            {STRINGS.share.saveImgBtn}
          </a>
        )}
      </div>
      {copied && (
        <div className="note-inline blue" role="status" style={{ marginTop: 8 }}>
          <Icon name="info" size={15} />
          <span>{STRINGS.share.copiedNote}</span>
        </div>
      )}

      <div className="note-inline gray" style={{ marginTop: 10 }}>
        <Icon name="info" size={15} />
        <span>{STRINGS.share.privacyNote}</span>
      </div>

      <button className="share-close" onClick={() => setOpen(false)}>
        {STRINGS.share.closeBtn}
      </button>
    </div>
  )
}
