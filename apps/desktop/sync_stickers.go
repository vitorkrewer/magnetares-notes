package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

// Sincronização de quadros e stickers com o Turso.
//
// Diferente das notas (revisões + feed de alterações), quadros e stickers
// usam last-writer-wins por updated_at nos dois sentidos: o push envia só o
// que está pendente; o pull lê a partição inteira do perfil e aplica o que
// for mais novo. Erros são devolvidos ao chamador (antes eram descartados, o
// que escondeu por muito tempo que nenhum quadro chegava à nuvem).

// syncStickerEntities sincroniza quadros e depois stickers (stickers dependem
// do quadro via FK). Falhas não interrompem a sincronização das notas: vão
// para o log e retornam um aviso para anexar à mensagem do resultado.
func (s *noteStore) syncStickerEntities(turso *TursoClient, profileID string) string {
	var failed []string
	if err := s.syncStickerBoardsDirect(turso, profileID); err != nil {
		log.Printf("sync stickers: quadros: %v", err)
		failed = append(failed, "quadros")
	}
	if err := s.syncStickersDirect(turso, profileID); err != nil {
		log.Printf("sync stickers: stickers: %v", err)
		failed = append(failed, "stickers")
	}
	if len(failed) == 0 {
		return ""
	}
	return fmt.Sprintf(" Atenção: falha parcial ao sincronizar %s (detalhes no log).", strings.Join(failed, " e "))
}

func (s *noteStore) syncStickerBoardsDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	// 1. Push apenas dos quadros pendentes.
	rows, err := s.db.Query(`SELECT id, name, color, position, deleted_at, created_at, updated_at FROM sticker_boards WHERE sync_state = 'pending'`)
	if err != nil {
		return fmt.Errorf("ler quadros pendentes: %w", err)
	}
	type pendingBoard struct {
		id, name, color      string
		position             float64
		deletedAt            sql.NullInt64
		createdAt, updatedAt int64
	}
	var pending []pendingBoard
	for rows.Next() {
		var board pendingBoard
		if err := rows.Scan(&board.id, &board.name, &board.color, &board.position, &board.deletedAt, &board.createdAt, &board.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler quadro pendente: %w", err))
			continue
		}
		pending = append(pending, board)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar quadros pendentes: %w", err))
	}
	_ = rows.Close()

	for _, board := range pending {
		var deletedAt any
		if board.deletedAt.Valid {
			deletedAt = board.deletedAt.Int64
		}
		if err := turso.Execute(`INSERT INTO sync_sticker_boards(user_id, id, name, color, position, deleted_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, id) DO UPDATE SET
				name = CASE WHEN excluded.updated_at >= updated_at THEN excluded.name ELSE name END,
				color = CASE WHEN excluded.updated_at >= updated_at THEN excluded.color ELSE color END,
				position = CASE WHEN excluded.updated_at >= updated_at THEN excluded.position ELSE position END,
				deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
				updated_at = MAX(excluded.updated_at, updated_at)`,
			profileID, board.id, board.name, board.color, board.position, deletedAt, board.createdAt, board.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar quadro %s: %w", board.id, err))
			continue
		}
		// Só limpa se não houve nova edição local durante o envio.
		if _, err := s.db.Exec(`UPDATE sticker_boards SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, board.id, board.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar quadro %s como sincronizado: %w", board.id, err))
		}
	}

	// 2. Pull dos quadros remotos (LWW). Ordenar por criação torna a
	// resolução de nomes duplicados determinística entre máquinas.
	_, remoteRows, err := turso.Query(`SELECT id, name, color, position, deleted_at, created_at, updated_at
		FROM sync_sticker_boards WHERE user_id = ? ORDER BY created_at ASC, id ASC`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar quadros remotos: %w", err))
		return errors.Join(problems...)
	}
	for _, row := range remoteRows {
		if len(row) < 7 {
			continue
		}
		board, err := stickerBoardFromTursoRow(row)
		if err != nil {
			problems = append(problems, err)
			continue
		}
		if err := s.applyRemoteStickerBoard(board); err != nil {
			problems = append(problems, fmt.Errorf("aplicar quadro %s: %w", board.id, err))
		}
	}
	return errors.Join(problems...)
}

type remoteStickerBoard struct {
	id, name, color      string
	position             float64
	deletedAt            any
	createdAt, updatedAt int64
}

func stickerBoardFromTursoRow(row []TursoValue) (remoteStickerBoard, error) {
	board := remoteStickerBoard{id: row[0].Value, name: row[1].Value, color: row[2].Value}
	var err error
	if board.position, err = tursoFloat(row[3]); err != nil {
		return board, fmt.Errorf("quadro %s: posição inválida: %w", board.id, err)
	}
	if row[4].Type != "null" && row[4].Value != "" {
		if board.deletedAt, err = tursoInt(row[4]); err != nil {
			return board, fmt.Errorf("quadro %s: deleted_at inválido: %w", board.id, err)
		}
	}
	if board.createdAt, err = tursoInt(row[5]); err != nil {
		return board, fmt.Errorf("quadro %s: created_at inválido: %w", board.id, err)
	}
	if board.updatedAt, err = tursoInt(row[6]); err != nil {
		return board, fmt.Errorf("quadro %s: updated_at inválido: %w", board.id, err)
	}
	return board, nil
}

const upsertPulledStickerBoardSQL = `INSERT INTO sticker_boards(id, name, color, position, deleted_at, created_at, updated_at, sync_state)
	VALUES (?, ?, ?, ?, ?, ?, ?, 'clean')
	ON CONFLICT(id) DO UPDATE SET
		name = CASE WHEN updated_at >= excluded.updated_at THEN name ELSE excluded.name END,
		color = CASE WHEN updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
		position = CASE WHEN updated_at >= excluded.updated_at THEN position ELSE excluded.position END,
		deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
		updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
		sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`

// applyRemoteStickerBoard aplica um quadro remoto. Se outro quadro local
// ativo já usa o mesmo nome (criados em máquinas diferentes), o quadro
// recebido ganha um sufixo — "Ideias (2)" — e volta como pendente para que a
// renomeação chegue à nuvem e às demais máquinas. Sem isso o índice único
// de nome rejeitava o quadro e todos os stickers dele.
func (s *noteStore) applyRemoteStickerBoard(board remoteStickerBoard) error {
	_, err := s.db.Exec(upsertPulledStickerBoardSQL, board.id, board.name, board.color, board.position, board.deletedAt, board.createdAt, board.updatedAt)
	if err == nil || !isUniqueConstraintError(err) {
		return err
	}
	name, err := s.availableStickerBoardName(board.name, board.id)
	if err != nil {
		return err
	}
	updatedAt := time.Now().UTC().UnixMilli()
	if updatedAt <= board.updatedAt {
		updatedAt = board.updatedAt + 1
	}
	if _, err := s.db.Exec(upsertPulledStickerBoardSQL, board.id, name, board.color, board.position, board.deletedAt, board.createdAt, updatedAt); err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE sticker_boards SET sync_state = 'pending' WHERE id = ?`, board.id)
	return err
}

func (s *noteStore) availableStickerBoardName(name, boardID string) (string, error) {
	base := strings.TrimSpace(name)
	if base == "" {
		base = "Quadro"
	}
	for suffix := 2; suffix < 1000; suffix++ {
		candidate := fmt.Sprintf("%s (%d)", base, suffix)
		var taken bool
		if err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM sticker_boards
			WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL AND id <> ?)`, candidate, boardID).Scan(&taken); err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("não há nome disponível para o quadro %q", name)
}

func (s *noteStore) syncStickersDirect(turso *TursoClient, profileID string) error {
	if turso == nil {
		return nil
	}
	var problems []error

	// 1. Push dos stickers pendentes.
	rows, err := s.db.Query(`SELECT id, board_id, title, body, color, position, pinned_at, deleted_at, created_at, updated_at FROM stickers WHERE sync_state = 'pending'`)
	if err != nil {
		return fmt.Errorf("ler stickers pendentes: %w", err)
	}
	type pendingSticker struct {
		id, boardID, title, body, color string
		position                        float64
		pinnedAt, deletedAt             sql.NullInt64
		createdAt, updatedAt            int64
	}
	var pending []pendingSticker
	for rows.Next() {
		var sticker pendingSticker
		if err := rows.Scan(&sticker.id, &sticker.boardID, &sticker.title, &sticker.body, &sticker.color, &sticker.position, &sticker.pinnedAt, &sticker.deletedAt, &sticker.createdAt, &sticker.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("ler sticker pendente: %w", err))
			continue
		}
		pending = append(pending, sticker)
	}
	if err := rows.Err(); err != nil {
		problems = append(problems, fmt.Errorf("iterar stickers pendentes: %w", err))
	}
	_ = rows.Close()

	for _, sticker := range pending {
		var pinnedAt, deletedAt any
		if sticker.pinnedAt.Valid {
			pinnedAt = sticker.pinnedAt.Int64
		}
		if sticker.deletedAt.Valid {
			deletedAt = sticker.deletedAt.Int64
		}
		if err := turso.Execute(`INSERT INTO sync_stickers(user_id, id, board_id, title, body, color, position, pinned_at, deleted_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, id) DO UPDATE SET
				board_id = CASE WHEN excluded.updated_at >= updated_at THEN excluded.board_id ELSE board_id END,
				title = CASE WHEN excluded.updated_at >= updated_at THEN excluded.title ELSE title END,
				body = CASE WHEN excluded.updated_at >= updated_at THEN excluded.body ELSE body END,
				color = CASE WHEN excluded.updated_at >= updated_at THEN excluded.color ELSE color END,
				position = CASE WHEN excluded.updated_at >= updated_at THEN excluded.position ELSE position END,
				pinned_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.pinned_at ELSE pinned_at END,
				deleted_at = CASE WHEN excluded.updated_at >= updated_at THEN excluded.deleted_at ELSE deleted_at END,
				updated_at = MAX(excluded.updated_at, updated_at)`,
			profileID, sticker.id, sticker.boardID, sticker.title, sticker.body, sticker.color, sticker.position, pinnedAt, deletedAt, sticker.createdAt, sticker.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("enviar sticker %s: %w", sticker.id, err))
			continue
		}
		if _, err := s.db.Exec(`UPDATE stickers SET sync_state = 'clean' WHERE id = ? AND updated_at = ?`, sticker.id, sticker.updatedAt); err != nil {
			problems = append(problems, fmt.Errorf("marcar sticker %s como sincronizado: %w", sticker.id, err))
		}
	}

	// 2. Pull dos stickers remotos (LWW).
	_, remoteRows, err := turso.Query(`SELECT id, board_id, title, body, color, position, pinned_at, deleted_at, created_at, updated_at
		FROM sync_stickers WHERE user_id = ?`, profileID)
	if err != nil {
		problems = append(problems, fmt.Errorf("buscar stickers remotos: %w", err))
		return errors.Join(problems...)
	}
	for _, row := range remoteRows {
		if len(row) < 10 {
			continue
		}
		if err := s.applyRemoteSticker(row); err != nil {
			problems = append(problems, fmt.Errorf("aplicar sticker %s: %w", row[0].Value, err))
		}
	}
	return errors.Join(problems...)
}

func (s *noteStore) applyRemoteSticker(row []TursoValue) error {
	position, err := tursoFloat(row[5])
	if err != nil {
		return fmt.Errorf("posição inválida: %w", err)
	}
	var pinnedAt, deletedAt any
	if row[6].Type != "null" && row[6].Value != "" {
		if pinnedAt, err = tursoInt(row[6]); err != nil {
			return fmt.Errorf("pinned_at inválido: %w", err)
		}
	}
	if row[7].Type != "null" && row[7].Value != "" {
		if deletedAt, err = tursoInt(row[7]); err != nil {
			return fmt.Errorf("deleted_at inválido: %w", err)
		}
	}
	createdAt, err := tursoInt(row[8])
	if err != nil {
		return fmt.Errorf("created_at inválido: %w", err)
	}
	updatedAt, err := tursoInt(row[9])
	if err != nil {
		return fmt.Errorf("updated_at inválido: %w", err)
	}
	_, err = s.db.Exec(`INSERT INTO stickers(id, board_id, title, body, color, position, pinned_at, deleted_at, created_at, updated_at, sync_state)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'clean')
		ON CONFLICT(id) DO UPDATE SET
			board_id = CASE WHEN updated_at >= excluded.updated_at THEN board_id ELSE excluded.board_id END,
			title = CASE WHEN updated_at >= excluded.updated_at THEN title ELSE excluded.title END,
			body = CASE WHEN updated_at >= excluded.updated_at THEN body ELSE excluded.body END,
			color = CASE WHEN updated_at >= excluded.updated_at THEN color ELSE excluded.color END,
			position = CASE WHEN updated_at >= excluded.updated_at THEN position ELSE excluded.position END,
			pinned_at = CASE WHEN updated_at >= excluded.updated_at THEN pinned_at ELSE excluded.pinned_at END,
			deleted_at = CASE WHEN updated_at >= excluded.updated_at THEN deleted_at ELSE excluded.deleted_at END,
			updated_at = CASE WHEN updated_at >= excluded.updated_at THEN updated_at ELSE excluded.updated_at END,
			sync_state = CASE WHEN sync_state = 'pending' AND updated_at >= excluded.updated_at THEN 'pending' ELSE 'clean' END`,
		row[0].Value, row[1].Value, row[2].Value, row[3].Value, row[4].Value, position, pinnedAt, deletedAt, createdAt, updatedAt)
	return err
}

// tursoFloat lê um valor REAL do Hrana. Aceita integer/text numéricos porque
// o SQLite pode devolver uma coluna REAL inteira como integer.
func tursoFloat(value TursoValue) (float64, error) {
	if value.Type == "null" || value.Value == "" {
		return 0, nil
	}
	return strconv.ParseFloat(value.Value, 64)
}

func isUniqueConstraintError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
