package handler

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateStickyNoteContentLimitAllowsOneThousandCharacters(t *testing.T) {
	layout := map[string]interface{}{
		"pages": []interface{}{
			[]interface{}{
				map[string]interface{}{
					"type": "widget",
					"widgetConfig": map[string]interface{}{
						"widgetType": "stickyNote",
						"content":    strings.Repeat("字", maxStickyNoteContentLength),
					},
				},
			},
		},
	}

	if err := validateStickyNoteContentLimit(layout); err != nil {
		t.Fatalf("expected valid sticky note content, got %v", err)
	}
}

func TestValidateStickyNoteContentLimitRejectsOversizedNestedStickyNote(t *testing.T) {
	layout := map[string]interface{}{
		"dock": []interface{}{
			map[string]interface{}{
				"type": "folder",
				"children": []interface{}{
					map[string]interface{}{
						"type": "widget",
						"widgetConfig": map[string]interface{}{
							"widgetType": "stickyNote",
							"content":    strings.Repeat("a", maxStickyNoteContentLength+1),
						},
					},
				},
			},
		},
	}

	err := validateStickyNoteContentLimit(layout)
	if !errors.Is(err, errStickyNoteContentTooLong) {
		t.Fatalf("expected oversized sticky note error, got %v", err)
	}
}

func TestValidateStickyNoteContentLimitRejectsStickyNoteConfigWithoutOwnWidgetType(t *testing.T) {
	layout := map[string]interface{}{
		"pages": []interface{}{
			[]interface{}{
				map[string]interface{}{
					"type":       "widget",
					"widgetType": "stickyNote",
					"widgetConfig": map[string]interface{}{
						"content": strings.Repeat("a", maxStickyNoteContentLength+1),
					},
				},
			},
		},
	}

	err := validateStickyNoteContentLimit(layout)
	if !errors.Is(err, errStickyNoteContentTooLong) {
		t.Fatalf("expected oversized sticky note error, got %v", err)
	}
}

func TestValidateStickyNoteContentLimitIgnoresOtherWidgetContent(t *testing.T) {
	layout := map[string]interface{}{
		"pages": []interface{}{
			[]interface{}{
				map[string]interface{}{
					"type": "widget",
					"widgetConfig": map[string]interface{}{
						"widgetType": "countdown",
						"content":    strings.Repeat("a", maxStickyNoteContentLength+1),
					},
				},
			},
		},
	}

	if err := validateStickyNoteContentLimit(layout); err != nil {
		t.Fatalf("expected non-sticky widget content to be ignored, got %v", err)
	}
}
