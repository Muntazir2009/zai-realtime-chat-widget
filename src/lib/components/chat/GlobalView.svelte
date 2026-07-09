<script lang="ts">
  import { Globe, Users } from 'lucide-svelte';
</script>

<div class="flex flex-col h-full" style="background-color: var(--bg-page);">
  <!-- Header -->
  <header class="glass-header safe-top flex items-center justify-between px-4" style="height: 60px; min-height: 60px; z-index: 50;">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #059669, #10b981);">
        <Globe size={16} color="white" />
      </div>
      <div>
        <h1 class="text-lg font-bold leading-tight" style="color: var(--text-primary);">Global</h1>
        <p class="text-[11px] leading-tight" style="color: var(--text-tertiary);">Public channels</p>
      </div>
    </div>
  </header>

  <!-- Empty State -->
  <div class="flex-1 flex items-center justify-center px-8 animate-fade-in" style="padding-bottom: 72px;">
    <div class="text-center">
      <div class="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5" style="background: linear-gradient(135deg, rgba(5, 150, 105, 0.1), rgba(16, 185, 129, 0.05));">
        <Users size={36} style="color: var(--color-primary); opacity: 0.6;" />
      </div>
      <p class="text-base font-semibold mb-1" style="color: var(--text-primary);">Coming Soon</p>
      <p class="text-sm text-center max-w-[260px] leading-relaxed" style="color: var(--text-tertiary);">
        Global channels will let you chat with everyone in real time. Stay tuned!
      </p>
    </div>
  </div>
</div>