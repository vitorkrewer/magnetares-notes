package main

import (
	"path/filepath"
	"testing"
)

func TestStickerBoardsAndStickersCRUD(t *testing.T) {
	app, err := NewApp(filepath.Join(t.TempDir(), "stickers.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()

	// 1. Navigation includes default board 'Geral'
	nav, err := app.ListNavigation()
	if err != nil {
		t.Fatal(err)
	}
	if len(nav.StickerBoards) == 0 {
		t.Fatal("expected default sticker board to be listed")
	}
	if nav.StickerBoards[0].ID != defaultStickerBoardID || nav.StickerBoards[0].Name != defaultStickerBoardName {
		t.Fatalf("unexpected default board: %+v", nav.StickerBoards[0])
	}

	// 2. Cannot delete default board
	if err := app.DeleteStickerBoard(defaultStickerBoardID); err == nil {
		t.Fatal("expected deleting default board to fail")
	}

	// 3. Create a new board
	ideasBoard, err := app.SaveStickerBoard(StickerBoard{Name: "Ideias Rápidas", Color: "purple"})
	if err != nil {
		t.Fatal(err)
	}
	if ideasBoard.ID == "" || ideasBoard.Name != "Ideias Rápidas" || ideasBoard.Color != "purple" {
		t.Fatalf("unexpected board saved: %+v", ideasBoard)
	}

	// 4. Name uniqueness check
	if _, err := app.SaveStickerBoard(StickerBoard{Name: "ideias rápidas"}); err == nil {
		t.Fatal("expected duplicate board name to be rejected")
	}

	// 5. Create stickers in the board
	s1, err := app.SaveSticker(Sticker{
		BoardID: ideasBoard.ID,
		Title:   "Comprar café",
		Body:    "Grãos especiais torra média",
		Color:   "yellow",
	})
	if err != nil {
		t.Fatal(err)
	}
	if s1.ID == "" || s1.Title != "Comprar café" || s1.Position != 0 {
		t.Fatalf("unexpected sticker 1: %+v", s1)
	}

	s2, err := app.SaveSticker(Sticker{
		BoardID: ideasBoard.ID,
		Title:   "Ligar para o cliente",
		Body:    "Alinhar detalhes do contrato",
		Color:   "blue",
	})
	if err != nil {
		t.Fatal(err)
	}
	// New sticker should be at top (position < s1.position)
	if s2.Position >= s1.Position {
		t.Fatalf("expected s2 (pos %f) to be before s1 (pos %f)", s2.Position, s1.Position)
	}

	// 6. List stickers for the board
	stickers, err := app.ListStickers(ideasBoard.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stickers) != 2 {
		t.Fatalf("expected 2 stickers, got %d", len(stickers))
	}
	if stickers[0].ID != s2.ID || stickers[1].ID != s1.ID {
		t.Fatalf("unexpected sticker order: [0]=%s, [1]=%s", stickers[0].ID, stickers[1].ID)
	}

	// 7. Pin sticker (s1 should move to top because it is pinned)
	pinnedS1, err := app.SetStickerPinned(s1.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if pinnedS1.PinnedAt == nil {
		t.Fatal("expected sticker to be pinned")
	}

	stickers, err = app.ListStickers(ideasBoard.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stickers[0].ID != s1.ID {
		t.Fatalf("expected pinned s1 to be first, got %s", stickers[0].ID)
	}

	// 8. Move sticker (unpin first, then move s1 before s2)
	_, _ = app.SetStickerPinned(s1.ID, false)
	movedS1, err := app.MoveSticker(s1.ID, ideasBoard.ID, s2.ID)
	if err != nil {
		t.Fatal(err)
	}
	if movedS1.Position >= s2.Position {
		t.Fatalf("expected moved s1 position (%f) to be before s2 (%f)", movedS1.Position, s2.Position)
	}

	// 9. Soft-delete sticker
	if err := app.DeleteSticker(s2.ID); err != nil {
		t.Fatal(err)
	}
	stickers, err = app.ListStickers(ideasBoard.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stickers) != 1 || stickers[0].ID != s1.ID {
		t.Fatalf("expected only s1 remaining, got: %+v", stickers)
	}

	// 10. Restore sticker
	restoredS2, err := app.RestoreSticker(s2.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restoredS2.ID != s2.ID {
		t.Fatalf("unexpected restored sticker: %+v", restoredS2)
	}

	// 11. Delete board cascades soft-delete to its stickers
	if err := app.DeleteStickerBoard(ideasBoard.ID); err != nil {
		t.Fatal(err)
	}
	stickers, err = app.ListStickers(ideasBoard.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stickers) != 0 {
		t.Fatalf("expected 0 stickers after board deletion, got %d", len(stickers))
	}

	// 12. Restoring a sticker whose board was deleted puts it in default board
	restoredS1, err := app.RestoreSticker(s1.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restoredS1.BoardID != defaultStickerBoardID {
		t.Fatalf("expected restored sticker to move to %s, got %s", defaultStickerBoardID, restoredS1.BoardID)
	}
}
