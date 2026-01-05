'use client';

import { useEffect, useRef } from 'react';
import videoMap from '@/data/video-map.json';
import styles from './VideoHeader.module.css';

const HLS_SRC = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
const PLYR_SRC =
  'https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.polyfilled.min.js';
const PLYR_CSS = 'https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css';

type Caption = {
  code: string;
  lang: string;
  label: string;
  src: string;
};

type VideoEntry = {
  key: string;
  title: string;
  pageLink: string;
  hls: string;
  captions: Caption[];
};

const map = videoMap as Record<string, VideoEntry>;

function ensureScript(src: string) {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === 'true') {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('load failed')), {
          once: true,
        });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function ensureStyle(href: string) {
  if (typeof window === 'undefined') return;
  const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function proxyUrl(url: string) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

export default function VideoHeader({ slug }: { slug: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const plyrRef = useRef<any>(null);

  const entry = map[slug];

  useEffect(() => {
    let cancelled = false;
    let boundTracks: TextTrack[] = [];
    let boundTrackList: TextTrackList | null = null;
    let boundPlyr: any = null;

    const applyPreferredTrack = () => {
      const video = videoRef.current;
      if (!video) return;
      const tracks = Array.from(video.textTracks || []);
      if (!tracks.length) return;
      const preferred =
        tracks.find((track) => track.language?.toLowerCase().startsWith('zh')) ||
        tracks.find((track) => track.language?.toLowerCase().startsWith('en')) ||
        tracks[0];
      tracks.forEach((track) => {
        track.mode = track === preferred ? 'showing' : 'disabled';
      });
    };

    const updateCaptionState = () => {
      const video = videoRef.current;
      if (!video) return;
      const plyrContainer = video.closest('.plyr');
      if (!plyrContainer) return;
      const captionsEl = plyrContainer.querySelector('.plyr__captions');
      if (!captionsEl) return;
      const captionsActive = plyrContainer.classList.contains('plyr--captions-active');
      const tracks = Array.from(video.textTracks || []);
      const hasActive = captionsActive && tracks.some((track) => {
        const cues = track.activeCues;
        if (!cues || cues.length === 0) return false;
        for (let i = 0; i < cues.length; i += 1) {
          const cue = cues[i] as VTTCue;
          if (cue && String(cue.text || '').trim()) return true;
        }
        return false;
      });
      captionsEl.classList.toggle('has-captions', hasActive);
    };

    const handleCaptionToggle = () => updateCaptionState();

    const bindCueListeners = () => {
      const video = videoRef.current;
      if (!video) return;
      const tracks = Array.from(video.textTracks || []);
      boundTracks = tracks;
      boundTrackList = video.textTracks || null;
      tracks.forEach((track) => {
        if (typeof track.addEventListener === 'function') {
          track.addEventListener('cuechange', updateCaptionState);
        } else {
          track.oncuechange = updateCaptionState;
        }
      });
      if (boundTrackList) {
        if (typeof boundTrackList.addEventListener === 'function') {
          boundTrackList.addEventListener('change', handleCaptionToggle);
        } else {
          boundTrackList.onchange = handleCaptionToggle as EventListener;
        }
      }
      updateCaptionState();
    };

    const setup = async () => {
      if (!entry || !videoRef.current) return;

      ensureStyle(PLYR_CSS);

      try {
        await Promise.all([ensureScript(PLYR_SRC), ensureScript(HLS_SRC)]);
      } catch (err) {
        console.error(err);
      }

      if (cancelled || !videoRef.current) return;

      if (plyrRef.current) {
        plyrRef.current.destroy();
        plyrRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const video = videoRef.current;
      const Plyr = (window as any).Plyr;
      if (Plyr) {
        plyrRef.current = new Plyr(video, {
          controls: [
            'play-large',
            'play',
            'progress',
            'current-time',
            'mute',
            'volume',
            'captions',
            'settings',
            'pip',
            'airplay',
            'fullscreen',
          ],
          settings: ['captions', 'speed'],
          captions: { active: true, update: true, language: 'zh' },
          fullscreen: { enabled: true, fallback: 'force' },
          i18n: {
            restart: '重新播放',
            rewind: '后退 {seektime} 秒',
            play: '播放',
            pause: '暂停',
            fastForward: '前进 {seektime} 秒',
            seek: '跳转',
            seekLabel: '{currentTime} / {duration}',
            played: '已播放',
            buffered: '已缓冲',
            currentTime: '当前时间',
            duration: '时长',
            volume: '音量',
            mute: '静音',
            unmute: '取消静音',
            enableCaptions: '开启字幕',
            disableCaptions: '关闭字幕',
            download: '下载',
            enterFullscreen: '进入全屏',
            exitFullscreen: '退出全屏',
            frameTitle: '{title} 播放器',
            captions: '字幕',
            settings: '设置',
            pip: '画中画',
            menuBack: '返回上级菜单',
            speed: '速度',
            normal: '正常',
            quality: '清晰度',
            loop: '循环',
            start: '开始',
            end: '结束',
            all: '全部',
            reset: '重置',
            disabled: '已关闭',
            enabled: '已开启',
            advertisement: '广告',
            qualityBadge: {
              2160: '4K',
              1440: 'HD',
              1080: 'HD',
              720: 'HD',
              576: 'SD',
              480: 'SD',
            },
          },
        });
        boundPlyr = plyrRef.current;
        if (boundPlyr && typeof boundPlyr.on === 'function') {
          boundPlyr.on('captionsenabled', handleCaptionToggle);
          boundPlyr.on('captionsdisabled', handleCaptionToggle);
          boundPlyr.on('captionsupdate', handleCaptionToggle);
        }
      }

      const source = proxyUrl(entry.hls);
      const Hls = (window as any).Hls;
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          backBufferLength: 30,
        });
        hlsRef.current = hls;
        hls.loadSource(source);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source;
      }

      bindCueListeners();
      video.addEventListener('loadedmetadata', applyPreferredTrack);
      video.addEventListener('loadeddata', applyPreferredTrack);
      video.addEventListener('loadedmetadata', updateCaptionState);
      video.addEventListener('loadeddata', updateCaptionState);
      setTimeout(applyPreferredTrack, 800);
      setTimeout(updateCaptionState, 800);
    };

    setup();

    return () => {
      cancelled = true;
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', applyPreferredTrack);
        videoRef.current.removeEventListener('loadeddata', applyPreferredTrack);
        videoRef.current.removeEventListener('loadedmetadata', updateCaptionState);
        videoRef.current.removeEventListener('loadeddata', updateCaptionState);
      }
      boundTracks.forEach((track) => {
        if (typeof track.removeEventListener === 'function') {
          track.removeEventListener('cuechange', updateCaptionState);
        } else {
          track.oncuechange = null;
        }
      });
      if (boundTrackList) {
        if (typeof boundTrackList.removeEventListener === 'function') {
          boundTrackList.removeEventListener('change', handleCaptionToggle);
        } else {
          boundTrackList.onchange = null;
        }
      }
      if (boundPlyr && typeof boundPlyr.off === 'function') {
        boundPlyr.off('captionsenabled', handleCaptionToggle);
        boundPlyr.off('captionsdisabled', handleCaptionToggle);
        boundPlyr.off('captionsupdate', handleCaptionToggle);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (plyrRef.current) {
        plyrRef.current.destroy();
        plyrRef.current = null;
      }
    };
  }, [entry?.hls, slug]);

  if (!entry) return null;

  return (
    <div className={styles.container} data-video-key={entry.key}>
      <video ref={videoRef} className={styles.player} playsInline controls>
        {entry.captions?.map((caption) => (
          <track
            key={`${entry.key}-${caption.code}`}
            kind="captions"
            label={caption.label}
            srcLang={caption.lang}
            src={proxyUrl(caption.src)}
            default={caption.code === 'CN'}
          />
        ))}
      </video>
    </div>
  );
}
