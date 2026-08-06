The Editor and Ask input.

```jsx
<ChatComposer value={draft} onChange={setDraft} onSend={send}
  placeholder="Ask for a draft into this document" pending={running} />
```

Enter sends, shift-Enter newlines. Chips live on the composer's own fill, not outside it.
