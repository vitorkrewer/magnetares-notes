package main

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	defaultStickerBoardID   = "board-default"
	defaultStickerBoardName = "Geral"
	defaultStickerColor     = "yellow"

	maxStickerBoardNameLen = 60
	maxStickerTitleLen     = 120
	maxStickerBodyLen      = 5000

	// Diferença mínima entre posições vizinhas antes de renumerar o quadro.
	stickerPositionEpsilon = 1e-9
)

// stickerColorIDs lista as cores permitidas (a UI mapeia cada id para um tom
// pastel compatível com os temas claro e escuro).
var stickerColorIDs = []string{"yellow", "orange", "pink", "purple", "blue", "teal", "green", "gray"}

// StickerBoard é uma view de stickers; funciona como uma pasta.
type StickerBoard struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Color        string `json:"color"`
	StickerCount int64  `json:"stickerCount"`
}

// Sticker é uma nota adesiva de texto simples (título e texto).
type Sticker struct {
	ID        string     `json:"id"`
	BoardID   string     `json:"boardId"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Color     string     `json:"color"`
	Position  float64    `json:"position"`
	PinnedAt  *time.Time `json:"pinnedAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

const stickerSelectColumns = `id, board_id, title, body, color, position, pinned_at, created_at, updated_at`

func normalizeStickerColor(color string) (string, error) {
	color = strings.ToLower(strings.TrimSpace(color))
	if color == "" {
		return defaultStickerColor, nil
	}
	for _, allowed := range stickerColorIDs {
		if color == allowed {
			return color, nil
		}
	}
	return "", fmt.Errorf("cor de sticker inválida: %q", color)
}

// stickerColorSQLList devolve a lista de cores permitidas como literal SQL.
// Os valores vêm de constantes do código, nunca de entrada do usuário.
func stickerColorSQLList() string {
	quoted := make([]string, len(stickerColorIDs))
	for i, id := range stickerColorIDs {
		quoted[i] = "'" + id + "'"
	}
	return strings.Join(quoted, ", ")
}

func (s *noteStore) listStickerBoards() ([]StickerBoard, error) {
	rows, err := s.db.Query(`SELECT b.id, b.name, b.color, COUNT(st.id)
		FROM sticker_boards b
		LEFT JOIN stickers st ON st.board_id = b.id AND st.deleted_at IS NULL
		WHERE b.deleted_at IS NULL
		GROUP BY b.id, b.name, b.color, b.position
		ORDER BY b.position, b.name COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("list sticker boards: %w", err)
	}
	defer rows.Close()

	boards := make([]StickerBoard, 0)
	for rows.Next() {
		var board StickerBoard
		if err := rows.Scan(&board.ID, &board.Name, &board.Color, &board.StickerCount); err != nil {
			return nil, fmt.Errorf("scan sticker board: %w", err)
		}
		boards = append(boards, board)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read sticker boards: %w", err)
	}
	return boards, nil
}

func (s *noteStore) getStickerBoard(id string) (StickerBoard, error) {
	var board StickerBoard
	err := s.db.QueryRow(`SELECT b.id, b.name, b.color, COUNT(st.id)
		FROM sticker_boards b
		LEFT JOIN stickers st ON st.board_id = b.id AND st.deleted_at IS NULL
		WHERE b.id = ? AND b.deleted_at IS NULL
		GROUP BY b.id, b.name, b.color`, id).Scan(&board.ID, &board.Name, &board.Color, &board.StickerCount)
	if err != nil {
		return StickerBoard{}, fmt.Errorf("get sticker board: %w", err)
	}
	return board, nil
}

func (s *noteStore) saveStickerBoard(board StickerBoard) (StickerBoard, error) {
	name := strings.TrimSpace(board.Name)
	if name == "" {
		return StickerBoard{}, errors.New("o nome do quadro é obrigatório")
	}
	if utf8.RuneCountInString(name) > maxStickerBoardNameLen {
		return StickerBoard{}, fmt.Errorf("o nome do quadro pode ter no máximo %d caracteres", maxStickerBoardNameLen)
	}
	color, err := normalizeStickerColor(board.Color)
	if err != nil {
		return StickerBoard{}, err
	}
	if board.ID == "" {
		board.ID = uuid.NewString()
	}

	tx, err := s.db.Begin()
	if err != nil {
		return StickerBoard{}, fmt.Errorf("begin save sticker board tx: %w", err)
	}
	defer tx.Rollback()

	var nameTaken bool
	if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM sticker_boards
		WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL AND id <> ?)`, name, board.ID).Scan(&nameTaken); err != nil {
		return StickerBoard{}, fmt.Errorf("check sticker board name: %w", err)
	}
	if nameTaken {
		return StickerBoard{}, errors.New("já existe um quadro com esse nome")
	}

	now := time.Now().UTC().UnixMilli()
	var deletedAt sql.NullInt64
	err = tx.QueryRow("SELECT deleted_at FROM sticker_boards WHERE id = ?", board.ID).Scan(&deletedAt)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		_, err = tx.Exec(`INSERT INTO sticker_boards(id, name, color, position, deleted_at, created_at, updated_at, sync_state)
			VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM sticker_boards), NULL, ?, ?, 'pending')`,
			board.ID, name, color, now, now)
		if err != nil {
			return StickerBoard{}, fmt.Errorf("create sticker board: %w", err)
		}
	case err != nil:
		return StickerBoard{}, fmt.Errorf("find sticker board: %w", err)
	case deletedAt.Valid:
		return StickerBoard{}, errors.New("o quadro foi excluído")
	default:
		_, err = tx.Exec(`UPDATE sticker_boards SET name = ?, color = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
			name, color, now, board.ID)
		if err != nil {
			return StickerBoard{}, fmt.Errorf("update sticker board: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return StickerBoard{}, fmt.Errorf("commit sticker board tx: %w", err)
	}
	return s.getStickerBoard(board.ID)
}

// deleteStickerBoard exclui logicamente o quadro e todos os stickers dele na
// mesma transação (tombstones, prontos para a futura sincronização).
func (s *noteStore) deleteStickerBoard(id string) error {
	if id == defaultStickerBoardID {
		return errors.New("o quadro padrão não pode ser excluído")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin delete sticker board tx: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC().UnixMilli()
	result, err := tx.Exec(`UPDATE sticker_boards SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE id = ? AND deleted_at IS NULL`, now, now, id)
	if err != nil {
		return fmt.Errorf("delete sticker board: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read sticker board deletion: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}

	if _, err := tx.Exec(`UPDATE stickers SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE board_id = ? AND deleted_at IS NULL`, now, now, id); err != nil {
		return fmt.Errorf("delete board stickers: %w", err)
	}
	return tx.Commit()
}

type stickerScanner interface {
	Scan(dest ...any) error
}

func scanSticker(scanner stickerScanner) (Sticker, error) {
	var sticker Sticker
	var pinnedAt sql.NullInt64
	var createdAt, updatedAt int64
	if err := scanner.Scan(&sticker.ID, &sticker.BoardID, &sticker.Title, &sticker.Body, &sticker.Color,
		&sticker.Position, &pinnedAt, &createdAt, &updatedAt); err != nil {
		return Sticker{}, err
	}
	if pinnedAt.Valid {
		pinned := time.UnixMilli(pinnedAt.Int64).UTC()
		sticker.PinnedAt = &pinned
	}
	sticker.CreatedAt = time.UnixMilli(createdAt).UTC()
	sticker.UpdatedAt = time.UnixMilli(updatedAt).UTC()
	return sticker, nil
}

func (s *noteStore) getSticker(id string) (Sticker, error) {
	sticker, err := scanSticker(s.db.QueryRow(`SELECT `+stickerSelectColumns+` FROM stickers WHERE id = ? AND deleted_at IS NULL`, id))
	if err != nil {
		return Sticker{}, fmt.Errorf("get sticker: %w", err)
	}
	return sticker, nil
}

// listStickers devolve os stickers ativos de um quadro: fixados primeiro e,
// dentro de cada grupo, pela posição definida ao arrastar.
func (s *noteStore) listStickers(boardID string) ([]Sticker, error) {
	rows, err := s.db.Query(`SELECT `+stickerSelectColumns+` FROM stickers
		WHERE board_id = ? AND deleted_at IS NULL
		ORDER BY pinned_at IS NULL, pinned_at DESC, position ASC, created_at ASC, id ASC`, boardID)
	if err != nil {
		return nil, fmt.Errorf("list stickers: %w", err)
	}
	defer rows.Close()

	stickers := make([]Sticker, 0)
	for rows.Next() {
		sticker, err := scanSticker(rows)
		if err != nil {
			return nil, fmt.Errorf("scan sticker: %w", err)
		}
		stickers = append(stickers, sticker)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read stickers: %w", err)
	}
	return stickers, nil
}

// saveSticker cria um sticker novo ou atualiza apenas o CONTEÚDO (título, texto
// e cor) de um existente. Quadro, posição e fixação têm métodos próprios para
// que um autosave atrasado nunca reverta uma movimentação. Um sticker excluído
// não é ressuscitado por autosave; use restoreSticker.
func (s *noteStore) saveSticker(sticker Sticker) (Sticker, error) {
	title := strings.TrimSpace(sticker.Title)
	if utf8.RuneCountInString(title) > maxStickerTitleLen {
		return Sticker{}, fmt.Errorf("o título pode ter no máximo %d caracteres", maxStickerTitleLen)
	}
	if utf8.RuneCountInString(sticker.Body) > maxStickerBodyLen {
		return Sticker{}, fmt.Errorf("o texto pode ter no máximo %d caracteres", maxStickerBodyLen)
	}
	color, err := normalizeStickerColor(sticker.Color)
	if err != nil {
		return Sticker{}, err
	}
	if sticker.ID == "" {
		sticker.ID = uuid.NewString()
	}
	boardID := strings.TrimSpace(sticker.BoardID)
	if boardID == "" {
		boardID = defaultStickerBoardID
	}

	tx, err := s.db.Begin()
	if err != nil {
		return Sticker{}, fmt.Errorf("begin save sticker tx: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC().UnixMilli()
	var deletedAt sql.NullInt64
	err = tx.QueryRow("SELECT deleted_at FROM stickers WHERE id = ?", sticker.ID).Scan(&deletedAt)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		var boardActive bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM sticker_boards WHERE id = ? AND deleted_at IS NULL)`, boardID).Scan(&boardActive); err != nil {
			return Sticker{}, fmt.Errorf("check sticker board: %w", err)
		}
		if !boardActive {
			return Sticker{}, errors.New("quadro de stickers não encontrado")
		}
		// Novos stickers entram no topo do grupo (menor posição do quadro - 1).
		_, err = tx.Exec(`INSERT INTO stickers(id, board_id, title, body, color, position, pinned_at, deleted_at, created_at, updated_at, sync_state)
			VALUES (?, ?, ?, ?, ?,
				(SELECT COALESCE(MIN(position), 1) - 1 FROM stickers WHERE board_id = ? AND deleted_at IS NULL),
				NULL, NULL, ?, ?, 'pending')`,
			sticker.ID, boardID, title, sticker.Body, color, boardID, now, now)
		if err != nil {
			return Sticker{}, fmt.Errorf("create sticker: %w", err)
		}
	case err != nil:
		return Sticker{}, fmt.Errorf("find sticker: %w", err)
	case deletedAt.Valid:
		return Sticker{}, errors.New("o sticker foi excluído")
	default:
		_, err = tx.Exec(`UPDATE stickers SET title = ?, body = ?, color = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
			title, sticker.Body, color, now, sticker.ID)
		if err != nil {
			return Sticker{}, fmt.Errorf("update sticker: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return Sticker{}, fmt.Errorf("commit sticker tx: %w", err)
	}
	return s.getSticker(sticker.ID)
}

func (s *noteStore) deleteSticker(id string) error {
	now := time.Now().UTC().UnixMilli()
	result, err := s.db.Exec(`UPDATE stickers SET deleted_at = ?, updated_at = ?, sync_state = 'pending'
		WHERE id = ? AND deleted_at IS NULL`, now, now, id)
	if err != nil {
		return fmt.Errorf("delete sticker: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read sticker deletion: %w", err)
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// restoreSticker desfaz a exclusão. Se o quadro de origem também foi excluído,
// o sticker volta para o quadro padrão.
func (s *noteStore) restoreSticker(id string) (Sticker, error) {
	now := time.Now().UTC().UnixMilli()
	result, err := s.db.Exec(`UPDATE stickers SET deleted_at = NULL, updated_at = ?, sync_state = 'pending',
		board_id = CASE WHEN board_id IN (SELECT id FROM sticker_boards WHERE deleted_at IS NULL) THEN board_id ELSE ? END
		WHERE id = ? AND deleted_at IS NOT NULL`, now, defaultStickerBoardID, id)
	if err != nil {
		return Sticker{}, fmt.Errorf("restore sticker: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Sticker{}, fmt.Errorf("read sticker restore: %w", err)
	}
	if affected == 0 {
		return Sticker{}, sql.ErrNoRows
	}
	return s.getSticker(id)
}

func (s *noteStore) setStickerPinned(id string, pinned bool) (Sticker, error) {
	now := time.Now().UTC().UnixMilli()
	var result sql.Result
	var err error
	if pinned {
		result, err = s.db.Exec(`UPDATE stickers SET pinned_at = COALESCE(pinned_at, ?), updated_at = ?, sync_state = 'pending'
			WHERE id = ? AND deleted_at IS NULL`, now, now, id)
	} else {
		result, err = s.db.Exec(`UPDATE stickers SET pinned_at = NULL, updated_at = ?, sync_state = 'pending'
			WHERE id = ? AND deleted_at IS NULL`, now, id)
	}
	if err != nil {
		return Sticker{}, fmt.Errorf("pin sticker: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Sticker{}, fmt.Errorf("read sticker pin: %w", err)
	}
	if affected == 0 {
		return Sticker{}, sql.ErrNoRows
	}
	return s.getSticker(id)
}

type stickerSlot struct {
	id       string
	position float64
}

// moveSticker coloca o sticker imediatamente antes de beforeID no quadro de
// destino (beforeID vazio = final). A posição é o ponto médio entre os vizinhos,
// então reordenar altera apenas uma linha; o quadro só é renumerado quando a
// diferença entre vizinhos fica menor que stickerPositionEpsilon.
func (s *noteStore) moveSticker(id, boardID, beforeID string) (Sticker, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Sticker{}, fmt.Errorf("begin move sticker tx: %w", err)
	}
	defer tx.Rollback()

	var currentBoardID string
	if err := tx.QueryRow(`SELECT board_id FROM stickers WHERE id = ? AND deleted_at IS NULL`, id).Scan(&currentBoardID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Sticker{}, sql.ErrNoRows
		}
		return Sticker{}, fmt.Errorf("find sticker to move: %w", err)
	}
	boardID = strings.TrimSpace(boardID)
	if boardID == "" {
		boardID = currentBoardID
	}
	if beforeID == id {
		return s.getSticker(id)
	}

	var boardActive bool
	if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM sticker_boards WHERE id = ? AND deleted_at IS NULL)`, boardID).Scan(&boardActive); err != nil {
		return Sticker{}, fmt.Errorf("check destination sticker board: %w", err)
	}
	if !boardActive {
		return Sticker{}, errors.New("quadro de stickers não encontrado")
	}

	rows, err := tx.Query(`SELECT id, position FROM stickers
		WHERE board_id = ? AND deleted_at IS NULL AND id <> ?
		ORDER BY position ASC, created_at ASC, id ASC`, boardID, id)
	if err != nil {
		return Sticker{}, fmt.Errorf("list destination stickers: %w", err)
	}
	slots := make([]stickerSlot, 0)
	for rows.Next() {
		var slot stickerSlot
		if err := rows.Scan(&slot.id, &slot.position); err != nil {
			rows.Close()
			return Sticker{}, fmt.Errorf("scan destination sticker: %w", err)
		}
		slots = append(slots, slot)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return Sticker{}, fmt.Errorf("read destination stickers: %w", err)
	}
	if err := rows.Close(); err != nil {
		return Sticker{}, fmt.Errorf("close destination stickers: %w", err)
	}

	now := time.Now().UTC().UnixMilli()
	position, err := stickerTargetPosition(tx, slots, beforeID, now)
	if err != nil {
		return Sticker{}, err
	}

	if _, err := tx.Exec(`UPDATE stickers SET board_id = ?, position = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
		boardID, position, now, id); err != nil {
		return Sticker{}, fmt.Errorf("move sticker: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Sticker{}, fmt.Errorf("commit move sticker tx: %w", err)
	}
	return s.getSticker(id)
}

// stickerTargetPosition calcula a posição de inserção entre os vizinhos
// existentes, renumerando o quadro (1..n) quando não há mais espaço.
func stickerTargetPosition(tx *sql.Tx, slots []stickerSlot, beforeID string, now int64) (float64, error) {
	if beforeID == "" {
		if len(slots) == 0 {
			return 0, nil
		}
		return slots[len(slots)-1].position + 1, nil
	}

	index := -1
	for i, slot := range slots {
		if slot.id == beforeID {
			index = i
			break
		}
	}
	if index < 0 {
		return 0, errors.New("sticker de referência não encontrado no quadro de destino")
	}
	if index == 0 {
		return slots[0].position - 1, nil
	}

	previous, next := slots[index-1].position, slots[index].position
	if next-previous >= stickerPositionEpsilon {
		return (previous + next) / 2, nil
	}

	// Sem espaço entre os vizinhos: renumera os stickers existentes como 1..n.
	for i := range slots {
		slots[i].position = float64(i + 1)
		if _, err := tx.Exec(`UPDATE stickers SET position = ?, updated_at = ?, sync_state = 'pending' WHERE id = ?`,
			slots[i].position, now, slots[i].id); err != nil {
			return 0, fmt.Errorf("renumber stickers: %w", err)
		}
	}
	return (slots[index-1].position + slots[index].position) / 2, nil
}
