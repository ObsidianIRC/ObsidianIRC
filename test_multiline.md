# Multiline Implementation Test

## Changes Made

1. **Updated capability negotiation to use `draft/multiline`** instead of `multiline`
2. **Added proper `draft/multiline-concat` tag support** for concatenating long lines
3. **Implemented two distinct behaviors:**
   - **Multi-line messages**: Lines joined with `\n` (normal multiline)
   - **Long single-line messages**: Lines joined without separator using `draft/multiline-concat` tag

## Key Behaviors

### Case 1: Multi-line message (has newlines)
```
Input: "Hello\nWorld\nHow are you?"
Output: 
  BATCH +abc123 draft/multiline #channel
  @batch=abc123 PRIVMSG #channel :Hello
  @batch=abc123 PRIVMSG #channel :World
  @batch=abc123 PRIVMSG #channel :How are you?
  BATCH -abc123

Result: "Hello\nWorld\nHow are you?"
```

### Case 2: Single very long line (over 400 chars)
```
Input: "This is a very long message that exceeds the IRC line limit and needs to be split using multiline-concat to preserve it as a single logical line without line breaks when displayed"
Output:
  BATCH +def456 draft/multiline #channel
  @batch=def456 PRIVMSG #channel :This is a very long message that exceeds the IRC line limit and needs to be split
  @batch=def456;draft/multiline-concat PRIVMSG #channel : using multiline-concat to preserve it as a single logical line without line breaks when displayed
  BATCH -def456

Result: "This is a very long message that exceeds the IRC line limit and needs to be split using multiline-concat to preserve it as a single logical line without line breaks when displayed"
```

### Case 3: Multi-line with some long lines
```
Input: "Short line\nThis is a very long line that needs to be split but should still be treated as a separate line from the short line above it\nAnother short line"
Output:
  BATCH +ghi789 draft/multiline #channel
  @batch=ghi789 PRIVMSG #channel :Short line
  @batch=ghi789 PRIVMSG #channel :This is a very long line that needs to be split but should still be treated as a separate
  @batch=ghi789;draft/multiline-concat PRIVMSG #channel : line from the short line above it
  @batch=ghi789 PRIVMSG #channel :Another short line
  BATCH -ghi789

Result: "Short line\nThis is a very long line that needs to be split but should still be treated as a separate line from the short line above it\nAnother short line"
```

## Testing Instructions

1. Connect to an IRC server that supports `draft/multiline` (like Ergo)
2. Test sending multi-line messages (type with Shift+Enter for new lines)
3. Test sending very long single-line messages (over 400 characters)
4. Verify that line breaks are preserved in multi-line cases
5. Verify that long single lines are displayed as continuous text without unwanted line breaks