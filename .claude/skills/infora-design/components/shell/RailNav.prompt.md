The app's primary sections, present on every authenticated screen.

```jsx
<RailNav items={[
  { label: 'Home', href: '/', glyph: <Home size={15} />, active: true },
  { label: 'Ask', href: '/ask', glyph: <Sparkles size={15} /> },
]} />
```

Always Lucide, 15px, 2px stroke. Active state is a frame-active fill plus bold weight — never a coloured accent.
