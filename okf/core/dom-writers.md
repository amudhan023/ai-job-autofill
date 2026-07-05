---
type: concept
title: Typed DOM Writers
description: Realm-safe, per-control-type writers that make fills register on React/Vue-controlled forms
tags: [dom, writers, react, forms, core]
---

# Typed DOM Writers

Source: `extension/src/adapters/domFill.ts`.

## The React-controlled-input problem

Setting `el.value = x` directly is invisible to React: its synthetic event
system only reacts to the *native* property setter followed by a real
`input`/`change` event, because React overrides the instance-level `value`
property with its own getter/setter and only the prototype's original setter
bypasses that override correctly. Every writer in this module goes through
`nativeValueSetter()`, which retrieves the setter from the **element's own
realm** (`el.ownerDocument.defaultView`), not the top frame's — necessary
because a control inside a same-origin iframe has its own
`HTMLInputElement.prototype`, distinct from the top document's. This mirrors
the realm-safety requirement in [field-discovery](field-discovery.md).

## Writer catalogue

| Control | Function | Strategy |
|---|---|---|
| text/textarea | `setInputValue` | native setter (or `.value=` fallback) + `input`+`change` events |
| native `<select>` | `setSelectValue` | exact `value` → case-insensitive exact text → substring text |
| contenteditable / role=textbox | `setContentEditableValue` | `.focus()` + `textContent =` + `input`+`change` events |
| react-select-style combobox | `setComboboxValue` (not shown above, see file) | type into the input to filter → open the menu via a full pointer sequence (typing alone never opens it) → read `aria-controls` *after* opening, since it only exists while the menu is open → match option exact→prefix→substring **scoped to that listbox** → click; Escape-closes on no match |
| popup listbox (intl-tel-input style) | `setPopupListboxValue` | click the trigger → panel opens → click the matching `role="option"` |
| file input | `setFileValue` | construct a `DataTransfer`, assign `.files`, dispatch events (works with styled "Attach" dropzone wrappers) |

## Why full pointer sequences, not just `.click()`

`clickSequence()` dispatches `pointerdown`, `mousedown`, `mouseup`, `click` in
order — some custom listbox widgets only listen for `mousedown`, so a bare
synthetic `click` event silently does nothing on them. This was discovered
against real production widgets, not written speculatively — see the
regression-test note in [platform-adapters](platform-adapters.md).

## Combobox listbox scoping — a documented regression

The option-matching code for react-select combobox restricts its
exact→prefix→substring search to the specific `aria-controls` listbox that
just opened, rather than searching the whole document. A code comment
records why: a document-wide fallback once matched the substring "No" to
"Norway" inside the *phone-country* picker's listbox while a different
combobox was open — i.e., cross-widget contamination. This is exactly the
kind of quirk the Greenhouse/Affirm live-DOM regression tests
(`content/greenhouseLive.test.ts`) exist to pin down.

## Contract with the executor

None of these writers ever click a submit control or navigate the page —
[fill-executor](fill-executor.md)'s zero-mutation guarantee depends on this
module having no such code path at all, not merely on the executor choosing
not to call it.
