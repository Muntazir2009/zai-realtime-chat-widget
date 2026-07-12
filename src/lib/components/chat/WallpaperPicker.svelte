<script lang="ts">
  import { X, Upload, Image as ImageIcon, Sparkles, Check, Trash2 } from 'lucide-svelte';
  import { uploadFile } from '$lib/firebase/storage';
  import { chatStore } from '$lib/stores/chat.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';

  interface Props {
    chatId: string;
    currentWallpaper: string | null | undefined;
    onClose: () => void;
  }

  let { chatId, currentWallpaper, onClose }: Props = $props();

  let isUploading = $state(false);
  let uploadProgress = $state(0);
  let activeTab = $state<'presets' | 'custom' | 'cloud'>('presets');

  // ── Uploaded wallpapers (localStorage) ──
  const STORAGE_KEY = 'chat-uploaded-wallpapers';
  const MAX_UPLOADED = 20;

  let uploadedWallpapers = $state<string[]>([]);

  function loadUploadedWallpapers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) uploadedWallpapers = JSON.parse(raw) as string[];
    } catch { /* ignore */ }
  }

  function saveUploadedWallpapers(list: string[]) {
    uploadedWallpapers = list;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
  }

  function addToUploaded(url: string) {
    const list = [url, ...uploadedWallpapers.filter(u => u !== url)].slice(0, MAX_UPLOADED);
    saveUploadedWallpapers(list);
  }

  function removeFromUploaded(url: string) {
    saveUploadedWallpapers(uploadedWallpapers.filter(u => u !== url));
    // If the removed wallpaper was active, clear it
    if (currentWallpaper === url) {
      chatStore.setChatWallpaper(chatId, null);
    }
    toastStore.info('Wallpaper removed from gallery');
  }

  // Load on mount
  loadUploadedWallpapers();

  const presetWallpapers = [
    { id: 'none', label: 'Default', preview: 'var(--bg-page)', css: '' },
    { id: 'warm', label: 'Warm', preview: 'linear-gradient(135deg, #fef3c7, #fde68a)', css: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
    { id: 'ocean', label: 'Ocean', preview: 'linear-gradient(135deg, #e0f2fe, #bae6fd)', css: 'linear-gradient(135deg, #e0f2fe, #bae6fd)' },
    { id: 'forest', label: 'Forest', preview: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', css: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
    { id: 'lavender', label: 'Lavender', preview: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', css: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' },
    { id: 'sunset', label: 'Sunset', preview: 'linear-gradient(135deg, #fecaca, #fda4af)', css: 'linear-gradient(135deg, #fecaca, #fda4af)' },
    { id: 'midnight', label: 'Midnight', preview: 'linear-gradient(135deg, #1e1b4b, #312e81)', css: 'linear-gradient(135deg, #1e1b4b, #312e81)' },
    { id: 'aurora', label: 'Aurora', preview: 'linear-gradient(135deg, #064e3b, #065f46, #047857)', css: 'linear-gradient(135deg, #064e3b, #065f46, #047857)' },
    { id: 'rose', label: 'Rose', preview: 'linear-gradient(135deg, #fff1f2, #fecdd3)', css: 'linear-gradient(135deg, #fff1f2, #fecdd3)' },
    { id: 'slate', label: 'Slate', preview: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', css: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)' },
    { id: 'peach', label: 'Peach', preview: 'linear-gradient(135deg, #ffedd5, #fed7aa)', css: 'linear-gradient(135deg, #ffedd5, #fed7aa)' },
    { id: 'mint', label: 'Mint', preview: 'linear-gradient(135deg, #ecfdf5, #d1fae5, #a7f3d0)', css: 'linear-gradient(135deg, #ecfdf5, #d1fae5, #a7f3d0)' },
  ];

  const cloudWallpapers = [
    { id: 'cloud-1', label: 'Mountains', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80' },
    { id: 'cloud-2', label: 'Stars', url: 'https://images.unsplash.com/photo-1475274047050-1d0c55b7a3cb?w=600&q=80' },
    { id: 'cloud-3', label: 'Ocean Wave', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80' },
    { id: 'cloud-4', label: 'Forest Path', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&q=80' },
    { id: 'cloud-5', label: 'Desert', url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=600&q=80' },
    { id: 'cloud-6', label: 'Northern Lights', url: 'https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=600&q=80' },
    { id: 'cloud-7', label: 'Abstract', url: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=600&q=80' },
    { id: 'cloud-8', label: 'Flowers', url: 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=600&q=80' },
  ];

  let fileInputEl: HTMLInputElement | null = $state(null);

  function isActive(id: string): boolean {
    if (id === 'none') return !currentWallpaper;
    return currentWallpaper === id || currentWallpaper === presetWallpapers.find(w => w.id === id)?.css;
  }

  async function selectPreset(wp: typeof presetWallpapers[0]) {
    if (wp.id === 'none') {
      await chatStore.setChatWallpaper(chatId, null);
    } else {
      await chatStore.setChatWallpaper(chatId, wp.css);
    }
    onClose();
  }

  async function selectCloud(wp: typeof cloudWallpapers[0]) {
    await chatStore.setChatWallpaper(chatId, wp.url);
    onClose();
  }

  async function selectUploaded(url: string) {
    await chatStore.setChatWallpaper(chatId, url);
    onClose();
  }

  async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    if (!file.type.startsWith('image/')) {
      toastStore.info('Only images are supported');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toastStore.info('Image must be under 5 MB');
      return;
    }

    isUploading = true;
    uploadProgress = 0;
    try {
      const result = await uploadFile(file, 'wallpapers', `wp-${Date.now()}.jpg`, (pct) => { uploadProgress = pct; });
      // Save to uploaded gallery
      addToUploaded(result.publicUrl);
      // Set as current wallpaper
      await chatStore.setChatWallpaper(chatId, result.publicUrl);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Wallpaper upload failed:', msg);
      toastStore.error(`Upload failed: ${msg.slice(0, 80)}`);
    } finally {
      isUploading = false;
      uploadProgress = 0;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wp-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('wp-backdrop')) onClose(); }}>
  <div class="wp-sheet">
    <!-- Header -->
    <div class="wp-header">
      <h3 class="wp-title">Chat Wallpaper</h3>
      <button class="wp-close" onclick={onClose} aria-label="Close">
        <X size={20} />
      </button>
    </div>

    <!-- Tabs -->
    <div class="wp-tabs">
      <button class="wp-tab" class:wp-tab-active={activeTab === 'presets'} onclick={() => (activeTab = 'presets')}>
        <Sparkles size={14} />
        <span>Presets</span>
      </button>
      <button class="wp-tab" class:wp-tab-active={activeTab === 'cloud'} onclick={() => (activeTab = 'cloud')}>
        <ImageIcon size={14} />
        <span>Cloud</span>
      </button>
      <button class="wp-tab" class:wp-tab-active={activeTab === 'custom'} onclick={() => (activeTab = 'custom')}>
        <Upload size={14} />
        <span>My Uploads</span>
      </button>
    </div>

    <!-- Upload progress -->
    {#if isUploading}
      <div class="wp-upload-progress">
        <div class="wp-upload-bar">
          <div class="wp-upload-fill" style="width: {uploadProgress}%"></div>
        </div>
        <span class="wp-upload-pct">{Math.round(uploadProgress)}%</span>
      </div>
    {/if}

    <!-- Content -->
    <div class="wp-content">
      {#if activeTab === 'presets'}
        <div class="wp-grid">
          {#each presetWallpapers as wp (wp.id)}
            <button
              class="wp-tile"
              class:wp-tile-active={isActive(wp.id)}
              onclick={() => selectPreset(wp)}
              aria-label="Wallpaper: {wp.label}"
            >
              <div class="wp-tile-preview" style="background: {wp.preview};"></div>
              <span class="wp-tile-label">{wp.label}</span>
              {#if isActive(wp.id)}
                <span class="wp-tile-check"><Check size={14} /></span>
              {/if}
            </button>
          {/each}
        </div>
      {:else if activeTab === 'cloud'}
        <div class="wp-grid wp-grid-cloud">
          {#each cloudWallpapers as wp (wp.id)}
            <button
              class="wp-tile wp-tile-photo"
              class:wp-tile-active={currentWallpaper === wp.url}
              onclick={() => selectCloud(wp)}
              aria-label="Wallpaper: {wp.label}"
            >
              <img src={wp.url} alt={wp.label} class="wp-cloud-img" loading="lazy" />
              <span class="wp-tile-label">{wp.label}</span>
              {#if currentWallpaper === wp.url}
                <span class="wp-tile-check"><Check size={14} /></span>
              {/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="wp-custom-area">
          <!-- Upload button -->
          <input
            bind:this={fileInputEl}
            type="file"
            accept="image/*"
            class="hidden"
            onchange={handleFileSelect}
          />
          <button class="wp-upload-btn" onclick={() => fileInputEl?.click()} disabled={isUploading}>
            <div class="wp-upload-icon">
              <Upload size={24} />
            </div>
            <p class="wp-upload-title">Upload New Wallpaper</p>
            <p class="wp-upload-desc">Choose a photo from your gallery</p>
            <p class="wp-upload-hint">Max 5 MB · JPG, PNG, WebP</p>
          </button>

          <!-- Uploaded wallpapers gallery -->
          {#if uploadedWallpapers.length > 0}
            <div class="wp-gallery-header">
              <span class="wp-gallery-title">Your Wallpapers</span>
              <span class="wp-gallery-count">{uploadedWallpapers.length}/{MAX_UPLOADED}</span>
            </div>
            <div class="wp-grid wp-grid-cloud">
              {#each uploadedWallpapers as url (url)}
                <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                <div
                  class="wp-tile wp-tile-photo"
                  class:wp-tile-active={currentWallpaper === url}
                  onclick={() => selectUploaded(url)}
                  role="button"
                  tabindex={0}
                  aria-label="Select uploaded wallpaper"
                  onkeydown={(e) => { if (e.key === 'Enter') selectUploaded(url); }}
                >
                  <img src={url} alt="Uploaded wallpaper" class="wp-cloud-img" loading="lazy" />
                  {#if currentWallpaper === url}
                    <span class="wp-tile-check"><Check size={14} /></span>
                  {/if}
                  <button
                    class="wp-delete-btn"
                    onclick={(e) => { e.stopPropagation(); removeFromUploaded(url); }}
                    aria-label="Delete wallpaper"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="wp-empty-gallery">
              <ImageIcon size={28} style="color: var(--text-tertiary); opacity: 0.5;" />
              <p class="wp-empty-text">No uploaded wallpapers yet</p>
              <p class="wp-empty-hint">Upload your first wallpaper above</p>
            </div>
          {/if}

          <!-- Remove current wallpaper button -->
          {#if currentWallpaper && currentWallpaper.startsWith('http')}
            <button class="wp-remove-btn" onclick={() => { chatStore.setChatWallpaper(chatId, null); onClose(); }}>
              Remove current wallpaper
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .wp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--overlay-bg);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: fadeIn 150ms ease both;
  }

  .wp-sheet {
    width: 100%;
    max-width: 480px;
    max-height: 85vh;
    background: var(--bg-elevated);
    border-radius: 20px 20px 0 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: sheetUp 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
    box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.12);
  }

  @keyframes sheetUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .wp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 8px;
    flex-shrink: 0;
  }

  .wp-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .wp-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--input-bg);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 150ms ease, background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .wp-close:active { transform: scale(0.9); }

  /* Tabs */
  .wp-tabs {
    display: flex;
    gap: 4px;
    padding: 4px 16px 12px;
    flex-shrink: 0;
  }

  .wp-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    border-radius: 99px;
    border: 1.5px solid var(--border-subtle);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .wp-tab:active { transform: scale(0.95); }

  .wp-tab-active {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);
  }

  /* Upload progress */
  .wp-upload-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px 10px;
    flex-shrink: 0;
  }

  .wp-upload-bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--input-bg);
    overflow: hidden;
  }

  .wp-upload-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 2px;
    transition: width 200ms ease;
  }

  .wp-upload-pct {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    text-align: right;
  }

  /* Content area */
  .wp-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 24px;
  }
  .wp-content::-webkit-scrollbar { width: 0; }

  /* Grid */
  .wp-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .wp-grid-cloud {
    grid-template-columns: repeat(2, 1fr);
  }

  /* Tile */
  .wp-tile {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    border: 2.5px solid transparent;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 200ms ease, box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent;
    background: none;
    padding: 0;
  }
  .wp-tile:active { transform: scale(0.94); }

  .wp-tile-active {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 25%, transparent);
  }

  .wp-tile-preview {
    aspect-ratio: 9 / 12;
    border-radius: 11px;
  }

  .wp-tile-photo .wp-tile-preview {
    display: none;
  }

  .wp-cloud-img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 11px;
    display: block;
  }

  .wp-tile-label {
    display: block;
    text-align: center;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
    padding: 5px 2px 2px;
    line-height: 1.2;
  }

  .wp-tile-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    animation: checkPop 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    z-index: 2;
  }

  @keyframes checkPop {
    from { transform: scale(0); }
    to { transform: scale(1); }
  }

  /* Delete button on uploaded wallpaper tiles */
  .wp-delete-btn {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 180ms ease, transform 180ms ease;
    z-index: 3;
    -webkit-tap-highlight-color: transparent;
  }
  .wp-tile:hover .wp-delete-btn,
  .wp-tile:active .wp-delete-btn {
    opacity: 1;
    transform: scale(1);
  }
  /* Always show delete on touch devices */
  @media (hover: none) {
    .wp-delete-btn {
      opacity: 0.7;
      transform: scale(1);
    }
  }
  .wp-delete-btn:active {
    transform: scale(0.85);
    background: rgba(220, 38, 38, 0.8);
  }

  /* Gallery header */
  .wp-gallery-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-top: 4px;
    margin-bottom: 8px;
  }

  .wp-gallery-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .wp-gallery-count {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  /* Empty gallery state */
  .wp-empty-gallery {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 0 8px;
  }

  .wp-empty-text {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    margin: 0;
  }

  .wp-empty-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 0;
  }

  /* Custom upload area */
  .wp-custom-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 20px 0;
  }

  .wp-upload-btn {
    width: 100%;
    max-width: 280px;
    padding: 24px 20px;
    border-radius: 18px;
    border: 2px dashed var(--border-subtle);
    background: var(--input-bg);
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    transition: border-color 200ms ease, background 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
  }
  .wp-upload-btn:active { transform: scale(0.97); border-color: var(--color-primary); }
  .wp-upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .wp-upload-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 2px;
  }

  .wp-upload-title {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .wp-upload-desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0;
  }

  .wp-upload-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 0;
  }

  .wp-remove-btn {
    padding: 10px 24px;
    border-radius: 12px;
    border: 1.5px solid color-mix(in srgb, var(--color-danger) 20%, transparent);
    background: color-mix(in srgb, var(--color-danger) 6%, transparent);
    color: var(--color-danger);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .wp-remove-btn:active { transform: scale(0.95); }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>