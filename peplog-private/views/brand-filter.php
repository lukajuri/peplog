<svg class="brand-filters" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="0" height="0">
  <filter id="journal-brand" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceGraphic" result="inkMask" type="matrix"
      values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0   -1.344 0 0 0 1.216"/>
    <feColorMatrix in="SourceGraphic" result="accentMask" type="matrix"
      values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0   -5.1 5.1 0 0 -0.96"/>
    <feFlood class="brand-main" flood-color="#095d7e" result="inkColor"/>
    <feComposite in="inkColor" in2="inkMask" operator="in" result="ink"/>
    <feFlood class="brand-detail" flood-color="#14967f" result="accentColor"/>
    <feComposite in="accentColor" in2="accentMask" operator="in" result="accent"/>
    <feMerge result="recolored"><feMergeNode in="ink"/><feMergeNode in="accent"/></feMerge>
    <feComposite in="recolored" in2="SourceAlpha" operator="in"/>
  </filter>
</svg>
