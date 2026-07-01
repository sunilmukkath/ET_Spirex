import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, MapPin, Mic, Square } from 'lucide-react'
import { api } from '../../api/client'
import type { EtQuestion } from '../../api/client'

type GpsValue = { lat: number; lng: number; accuracy?: number; captured_at?: number }
type MediaValue = { url: string; media_id?: string; mime?: string }

function isGpsValue(v: unknown): v is GpsValue {
  return Boolean(v && typeof v === 'object' && 'lat' in v && 'lng' in v)
}

function isMediaValue(v: unknown): v is MediaValue {
  return Boolean(v && typeof v === 'object' && 'url' in v)
}

export function GpsCapture({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: GpsValue | null) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gps = isGpsValue(value) ? value : null

  function capture() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.')
      return
    }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at: Date.now(),
        })
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Could not get location. Allow location access and try again.')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={capture}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:border-[var(--et-navy)]/30 disabled:opacity-50"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
        {gps ? 'Update location' : 'Tag GPS location'}
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {gps && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-slate-700">
          <p>
            <span className="font-medium">Lat:</span> {gps.lat.toFixed(6)}{' '}
            <span className="font-medium">Lng:</span> {gps.lng.toFixed(6)}
          </p>
          {gps.accuracy != null && <p className="text-slate-500">Accuracy ±{Math.round(gps.accuracy)}m</p>}
          <a
            href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[var(--et-teal)] hover:underline"
          >
            View on map
          </a>
        </div>
      )}
    </div>
  )
}

export function PhotoCapture({
  slug,
  question,
  value,
  onChange,
}: {
  slug: string
  question: EtQuestion
  value: unknown
  onChange: (v: MediaValue | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const media = isMediaValue(value) ? value : null

  async function handleFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const result = await api.uploadCollectorMedia(slug, file, 'photo', question.id)
      onChange({ url: result.url, media_id: result.media_id, mime: file.type })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const captureAttr = question.camera_only ? 'environment' : undefined

  return (
    <div className="mt-3 space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={captureAttr}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:border-[var(--et-navy)]/30 disabled:opacity-50"
      >
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        {media ? 'Retake photo' : 'Take or upload photo'}
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {media?.url && (
        <img
          src={media.url}
          alt="Captured"
          className="max-h-48 rounded-lg border border-slate-200 object-contain"
        />
      )}
    </div>
  )
}

export function AudioCapture({
  slug,
  question,
  value,
  onChange,
}: {
  slug: string
  question: EtQuestion
  value: unknown
  onChange: (v: MediaValue | null) => void
}) {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const media = isMediaValue(value) ? value : null
  const maxSeconds = question.max_recording_seconds ?? 120

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      recorderRef.current?.stop()
    }
  }, [])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : ''
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        void uploadRecording(recorder.mimeType || 'audio/webm')
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      timerRef.current = window.setTimeout(() => stopRecording(), maxSeconds * 1000)
    } catch {
      setError('Microphone access denied or unavailable.')
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }

  async function uploadRecording(mime: string) {
    const blob = new Blob(chunksRef.current, { type: mime })
    if (!blob.size) {
      setError('Recording was empty.')
      return
    }
    const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `recording.${ext}`, { type: mime.split(';')[0] })
    setUploading(true)
    setError(null)
    try {
      const result = await api.uploadCollectorMedia(slug, file, 'audio', question.id)
      onChange({ url: result.url, media_id: result.media_id, mime: file.type })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:border-[var(--et-navy)]/30 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
            {media ? 'Record again' : 'Start recording'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Square size={14} fill="currentColor" />
            Stop
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">Max {maxSeconds}s · uses device microphone</p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {recording && (
        <p className="flex items-center gap-1 text-xs text-rose-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          Recording…
        </p>
      )}
      {media?.url && !recording && (
        <audio controls src={media.url} className="w-full max-w-md" />
      )}
    </div>
  )
}
