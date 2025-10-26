# Three-Way Merge Implementation for HtmlRender

## Overview

HtmlRender implements a **three-way merge** strategy that preserves external DOM modifications during updates. This allows external code to modify element properties, and those changes will be preserved when re-rendering with an unchanged HtmlObject.

## How It Works

### The Three States

The three-way merge compares three versions of state:

1. **Old HtmlObject** - The previous object definition (stored in `storage.object`)
2. **New HtmlObject** - The incoming object definition (parameter to `render()`)
3. **Current DOM State** - The actual DOM element state (may include external changes)

### Merge Logic

For each property type (attributes, content, CSS), the system follows this decision tree:

```
IF property changed in HtmlObject (oldObject !== newObject):
    → Update DOM to match new HtmlObject
    → Clear external change tracking for that property
ELSE IF property unchanged in HtmlObject:
    IF property was externally modified:
        → Preserve current DOM state
    ELSE:
        → Ensure DOM matches HtmlObject (in case of desync)
```

## Implementation Details

### 1. External Change Tracking

Each `ObjectStorage` now includes an `externalChanges` object that tracks which properties were modified externally:

```typescript
externalChanges: {
    attributes: Set<string>,       // e.g., {'data-custom', 'title'}
    textContent: boolean,           // true if text was changed externally
    innerHTML: boolean,             // true if HTML was changed externally
    classList: Set<string>,         // Classes added/removed externally
}
```

### 2. MutationObserver

A `MutationObserver` is attached to each element to detect external changes:

- **Attributes**: Tracks which attributes are modified
- **Classes**: Tracks which classes are added/removed
- **Character Data**: Detects text content changes
- **Child List**: Detects innerHTML changes

The observer ignores changes made by HtmlRender itself using a special flag (`__htmlRenderInternalUpdate`).

### 3. Internal Update Helpers

Three helper methods ensure HtmlRender's own updates don't trigger external change tracking:

- `setAttributeInternal(element, key, value)`
- `setTextContentInternal(element, content)`
- `setInnerHTMLInternal(element, content)`

These methods set a temporary flag on the element that the MutationObserver checks.

## Usage Examples

### Example 1: External Attribute Modification

```typescript
// Initial render
const htmlObject = {
    tag: 'div',
    identifier: 'my-div',
    type: 'text',
    attribute: {
        'data-status': 'active'
    },
    content: { en: 'Hello' }
};
htmlRender.render(htmlObject);

// External code modifies the element
const element = document.querySelector('[data-identifier="my-div"]');
element.setAttribute('data-custom', 'external-value');

// Re-render with same object
htmlRender.render(htmlObject);

// Result: data-custom="external-value" is preserved ✓
// Because: 'data-custom' was not in the HtmlObject, so external change is kept
```

### Example 2: Object Property Change Overrides External Modifications

```typescript
// Initial render
const htmlObject = {
    tag: 'div',
    identifier: 'my-div',
    type: 'text',
    attribute: {
        'data-count': '0'
    },
    content: { en: 'Counter' }
};
htmlRender.render(htmlObject);

// External code modifies
element.setAttribute('data-count', '999');

// Re-render with CHANGED object
htmlObject.attribute['data-count'] = '1';
htmlRender.render(htmlObject);

// Result: data-count="1" ✓
// Because: Object definition changed (0 → 1), so it overrides external change
```

### Example 3: Text Content Preservation

```typescript
// Initial render
const htmlObject = {
    tag: 'div',
    identifier: 'my-div',
    type: 'text',
    content: { en: 'Original Text' }
};
htmlRender.render(htmlObject);

// External code modifies text
element.textContent = 'User edited this text';

// Re-render with SAME content
htmlRender.render(htmlObject);

// Result: "User edited this text" is preserved ✓
// Because: content unchanged in object, external change preserved
```

### Example 4: Content Change Overrides External Text

```typescript
// Continuing from Example 3...

// Re-render with DIFFERENT content
htmlObject.content.en = 'New Text from Object';
htmlRender.render(htmlObject);

// Result: "New Text from Object" ✓
// Because: Content changed in object definition, overrides external change
```

## CSS Class Handling

CSS classes are handled specially due to HtmlRender's dynamic CSS system:

- **Generated classes** (e.g., `css-0`, `css-1`) are managed by `applyCSSBlocks()`
- **External classes** (any non-css-* class) are tracked if added externally
- When CSS blocks change in the object definition, all `css-*` classes are replaced
- When CSS blocks are unchanged, existing `css-*` classes are preserved

```typescript
// Initial render with CSS
const htmlObject = {
    tag: 'div',
    identifier: 'my-div',
    type: 'text',
    css: [
        { selector: '&', rules: [['color', 'blue']] }
    ],
    content: { en: 'Styled' }
};
htmlRender.render(htmlObject);
// Element has class: "css-0"

// External code adds class
element.classList.add('highlight', 'custom-style');

// Re-render with SAME CSS
htmlRender.render(htmlObject);
// Result: classes are "css-0 highlight custom-style"
// Both css-0 (from object) and external classes preserved

// Re-render with DIFFERENT CSS
htmlObject.css[0].rules = [['color', 'red']];
htmlRender.render(htmlObject);
// Result: css-0 is removed, new css-1 is added
// External classes behavior depends on implementation
```

## Key Benefits

1. **Hybrid Editing**: Allows visual editors and code to coexist
   - Visual editor can modify DOM directly
   - Re-rendering from code preserves visual changes when appropriate

2. **Predictable Behavior**: Clear rules about when changes are preserved vs. overridden
   - Object changes always win
   - External changes preserved when object unchanged

3. **State Synchronization**: Prevents state drift while allowing flexibility
   - External changes are tracked explicitly
   - Can query which properties were modified externally

4. **Building Mode Integration**: Works seamlessly with existing building mode
   - Debug overlays don't interfere with change tracking
   - External modifications during visual editing are properly tracked

## Performance Considerations

- **MutationObserver overhead**: One observer per element
  - Observers are disconnected when elements are disposed
  - Mutations from internal updates are filtered immediately

- **Deep comparison**: Text/HTML content is compared using `parseContent()`
  - Only happens during updates, not on every mutation
  - Async function calls are cached in parsing

- **Class tracking**: Class mutations track added/removed classes
  - Uses Set for efficient lookups
  - Only non-css-* classes tracked for external changes

## Migration Guide

### From Old Behavior (Controlled Component)

**Before**: External changes were always overwritten
```typescript
element.setAttribute('data-user-edit', 'yes');
htmlRender.render(htmlObject); // data-user-edit is lost ✗
```

**After**: External changes are preserved when object unchanged
```typescript
element.setAttribute('data-user-edit', 'yes');
htmlRender.render(htmlObject); // data-user-edit is preserved ✓
```

### What Stays the Same

- Object definition is still the source of truth
- Changing a property in the object will update the DOM
- Building mode still works the same way
- Event listeners and storage work identically

### What Changed

- External modifications are now tracked
- Re-rendering with unchanged object preserves external changes
- MutationObservers are created for each element
- `ObjectStorage` interface has new fields

## Testing

See `three-way-merge-test.html` for interactive examples demonstrating:

1. Attribute preservation when object unchanged
2. Attribute updates when object changed
3. Text content preservation
4. Text content updates
5. CSS class handling

## Future Enhancements

Possible improvements:

1. **Configurable mode**: Add option to disable three-way merge for specific elements
2. **Conflict resolution**: Add callbacks to handle merge conflicts
3. **Change events**: Emit events when external changes are detected
4. **Performance optimization**: Batch MutationObserver callbacks
5. **Selective tracking**: Only track specific attributes/properties

## API Reference

### ObjectStorage.externalChanges

```typescript
interface ExternalChanges {
    attributes: Set<string>;     // Externally modified attribute names
    textContent: boolean;         // Whether text content was modified
    innerHTML: boolean;           // Whether HTML content was modified
    classList: Set<string>;       // Externally modified classes
}
```

### Internal Methods

```typescript
// Set attribute without triggering external change tracking
private setAttributeInternal(element: HTMLElement, key: string, value: string | null): void

// Set text content without triggering tracking
private setTextContentInternal(element: HTMLElement, content: string): void

// Set innerHTML without triggering tracking
private setInnerHTMLInternal(element: HTMLElement, content: string): void

// Setup MutationObserver for an element
private setupExternalChangeTracking(storage: ObjectStorage): void
```

## Troubleshooting

### External changes are being lost

**Check**: Is the property changing in the HtmlObject?
- If yes, that's expected - object changes override external changes
- If no, check if MutationObserver is properly set up

### Too many re-renders or performance issues

**Solution**: Consider:
- Using `renderElementWithIdentifier()` for partial updates
- Checking if objects are unnecessarily recreated
- Verifying MutationObserver callbacks aren't causing loops

### Classes not preserved

**Check**: Are they `css-*` classes?
- Generated CSS classes are replaced when CSS definition changes
- Non-css-* classes should be tracked in `externalChanges.classList`

## Conclusion

The three-way merge implementation provides a balance between:
- **Declarative control** (HtmlObject as source of truth)
- **Flexibility** (preserving external modifications)
- **Predictability** (clear merge rules)

This makes HtmlRender suitable for both pure code-driven UIs and hybrid visual+code editing workflows.
