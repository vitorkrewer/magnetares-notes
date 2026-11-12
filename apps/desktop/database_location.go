package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// DatabaseTargetInfo descreve o diagnóstico prévio de um caminho de destino para o banco SQLite.
type DatabaseTargetInfo struct {
	CurrentPath  string `json:"currentPath"`
	ResolvedPath string `json:"resolvedPath"`
	DefaultPath  string `json:"defaultPath"`
	SameLocation bool   `json:"sameLocation"`
	TargetExists bool   `json:"targetExists"`
	TargetNotes  int    `json:"targetNotes"`
	CurrentNotes int    `json:"currentNotes"`
	IsCustom     bool   `json:"isCustom"`
	IsPortable   bool   `json:"isPortable"`
}

func resolveSystemDefaultDatabasePath() (string, error) {
	if portableDir := getPortableDataDir(); portableDir != "" {
		return filepath.Join(portableDir, "magnetares.db"), nil
	}
	baseDirectory := os.Getenv("LOCALAPPDATA")
	if baseDirectory == "" {
		var err error
		baseDirectory, err = os.UserConfigDir()
		if err != nil {
			return "", fmt.Errorf("localizar diretório padrão da aplicação: %w", err)
		}
	}
	return filepath.Join(baseDirectory, "Magnetares Notes", "magnetares.db"), nil
}

func normalizeDatabaseTargetPath(rawPath string) (string, error) {
	trimmed := strings.TrimSpace(rawPath)
	if trimmed == "" {
		return "", errors.New("informe um caminho válido para o banco de dados")
	}

	cleaned := filepath.Clean(trimmed)
	if info, err := os.Stat(cleaned); err == nil && info.IsDir() {
		cleaned = filepath.Join(cleaned, "magnetares.db")
	} else if !strings.EqualFold(filepath.Ext(cleaned), ".db") {
		cleaned = filepath.Join(cleaned, "magnetares.db")
	}

	absPath, err := filepath.Abs(cleaned)
	if err != nil {
		return "", fmt.Errorf("resolver caminho absoluto: %w", err)
	}
	return absPath, nil
}

func pathsEqual(a, b string) bool {
	absA, errA := filepath.Abs(filepath.Clean(a))
	absB, errB := filepath.Abs(filepath.Clean(b))
	if errA != nil || errB != nil {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return strings.EqualFold(absA, absB)
}

func verifyDirectoryWritable(dirPath string) error {
	if err := os.MkdirAll(dirPath, 0o700); err != nil {
		return fmt.Errorf("não foi possível criar a pasta de destino (%s): %w", dirPath, err)
	}
	probe, err := os.CreateTemp(dirPath, ".magnetares-write-probe-*")
	if err != nil {
		return fmt.Errorf("sem permissão de escrita na pasta de destino (%s): %w", dirPath, err)
	}
	probeName := probe.Name()
	_ = probe.Close()
	_ = os.Remove(probeName)
	return nil
}

func inspectSQLiteFile(dbPath string) (exists bool, noteCount int, err error) {
	info, statErr := os.Stat(dbPath)
	if errors.Is(statErr, os.ErrNotExist) {
		return false, 0, nil
	}
	if statErr != nil {
		return false, 0, fmt.Errorf("acessar arquivo de destino: %w", statErr)
	}
	if info.IsDir() {
		return false, 0, errors.New("o caminho informado aponta para um diretório")
	}
	if info.Size() == 0 {
		return true, 0, nil
	}

	db, openErr := sql.Open("sqlite", dbPath+"?mode=ro")
	if openErr != nil {
		return true, 0, fmt.Errorf("arquivo de destino não é um SQLite válido: %w", openErr)
	}
	defer db.Close()

	var integrity string
	if scanErr := db.QueryRow(`PRAGMA integrity_check`).Scan(&integrity); scanErr != nil || !strings.EqualFold(integrity, "ok") {
		return true, 0, errors.New("o arquivo .db existente no destino falhou na verificação de integridade SQLite")
	}

	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL`).Scan(&count)
	return true, count, nil
}

func countActiveNotesInStore(store *noteStore) int {
	if store == nil || store.db == nil {
		return 0
	}
	var count int
	_ = store.db.QueryRow(`SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL`).Scan(&count)
	return count
}

func vacuumIntoFile(store *noteStore, destPath string) error {
	if store == nil || store.db == nil {
		return errors.New("banco atual não está aberto")
	}
	_ = os.Remove(destPath)
	escaped := strings.ReplaceAll(destPath, "'", "''")
	if _, err := store.db.Exec(fmt.Sprintf("VACUUM INTO '%s'", escaped)); err != nil {
		return fmt.Errorf("consolidar snapshot SQLite: %w", err)
	}
	// Verifica integridade do arquivo gerado antes de efetivar a troca.
	checkDB, err := sql.Open("sqlite", destPath+"?mode=ro")
	if err != nil {
		_ = os.Remove(destPath)
		return fmt.Errorf("validar snapshot gerado: %w", err)
	}
	defer checkDB.Close()

	var integrity string
	if err := checkDB.QueryRow(`PRAGMA integrity_check`).Scan(&integrity); err != nil || !strings.EqualFold(integrity, "ok") {
		_ = os.Remove(destPath)
		return errors.New("falha na verificação de integridade do banco migrado")
	}
	return nil
}

func (a *App) inspectDatabaseTarget(rawTarget string) (DatabaseTargetInfo, error) {
	currentPath := a.store.path
	if absCurrent, err := filepath.Abs(currentPath); err == nil {
		currentPath = absCurrent
	}
	defaultPath, _ := resolveSystemDefaultDatabasePath()

	resolved, err := normalizeDatabaseTargetPath(rawTarget)
	if err != nil {
		return DatabaseTargetInfo{}, err
	}

	same := pathsEqual(currentPath, resolved)
	if !same {
		if err := verifyDirectoryWritable(filepath.Dir(resolved)); err != nil {
			return DatabaseTargetInfo{}, err
		}
	}

	targetExists, targetNotes, inspectErr := inspectSQLiteFile(resolved)
	if inspectErr != nil {
		return DatabaseTargetInfo{}, inspectErr
	}

	return DatabaseTargetInfo{
		CurrentPath:  currentPath,
		ResolvedPath: resolved,
		DefaultPath:  defaultPath,
		SameLocation: same,
		TargetExists: targetExists,
		TargetNotes:  targetNotes,
		CurrentNotes: countActiveNotesInStore(a.store),
		IsCustom:     loadConfiguredDatabasePath() != "",
		IsPortable:   getPortableDataDir() != "",
	}, nil
}

func (a *App) migrateDatabaseLocation(rawTarget, mode string, clearCustomConfig bool) (string, error) {
	mode = strings.TrimSpace(mode)
	if mode == "" {
		mode = "copy"
	}
	if mode != "copy" && mode != "use_existing" && mode != "fresh" {
		return "", fmt.Errorf("modo de migração inválido: %s", mode)
	}

	info, err := a.inspectDatabaseTarget(rawTarget)
	if err != nil {
		return "", err
	}
	if info.SameLocation {
		if clearCustomConfig {
			_ = saveConfiguredDatabasePath("")
		}
		return info.ResolvedPath, nil
	}

	oldPath := info.CurrentPath
	newPath := info.ResolvedPath

	// 1. Cria backup automático de segurança do banco atual antes de qualquer troca.
	recoveryDir := filepath.Join(filepath.Dir(oldPath), "recovery")
	if mkErr := os.MkdirAll(recoveryDir, 0o700); mkErr != nil {
		return "", fmt.Errorf("criar pasta de segurança: %w", mkErr)
	}
	stamp := time.Now().UTC().Format("20060102-150405")
	safetyBackup := filepath.Join(recoveryDir, fmt.Sprintf("pre-move-%s.db", stamp))
	if err := vacuumIntoFile(a.store, safetyBackup); err != nil {
		return "", fmt.Errorf("gerar backup de segurança antes da troca: %w", err)
	}

	// 2. Se for modo "copy", gera snapshot atômico no diretório de destino em arquivo temporário.
	tmpTarget := fmt.Sprintf("%s.migrating-%d.tmp", newPath, time.Now().UnixNano())
	if mode == "copy" {
		if err := vacuumIntoFile(a.store, tmpTarget); err != nil {
			return "", err
		}
	} else if mode == "use_existing" && !info.TargetExists {
		return "", errors.New("nenhum banco existente foi encontrado no caminho informado")
	}

	// 3. Fecha a conexão atual (fazendo checkpoint do WAL no encerramento).
	if err := a.store.close(); err != nil {
		_ = os.Remove(tmpTarget)
		a.store, _ = openNoteStore(oldPath)
		return "", fmt.Errorf("fechar banco atual com segurança: %w", err)
	}

	rollbackToOld := func(cause error) (string, error) {
		_ = os.Remove(tmpTarget)
		reopened, openErr := openNoteStore(oldPath)
		if openErr == nil {
			a.store = reopened
		}
		return "", cause
	}

	// 4. Se já existir arquivo no destino e o modo não for "use_existing", preserva cópia de segurança dele.
	if info.TargetExists && mode != "use_existing" {
		existingBackup := fmt.Sprintf("%s.bak-%s", newPath, stamp)
		if err := copyFile(newPath, existingBackup); err != nil {
			return rollbackToOld(fmt.Errorf("proteger banco existente no destino: %w", err))
		}
		_ = os.Remove(newPath)
		_ = os.Remove(newPath + "-wal")
		_ = os.Remove(newPath + "-shm")
	}

	if mode == "copy" {
		if err := os.Rename(tmpTarget, newPath); err != nil {
			if cpErr := copyFile(tmpTarget, newPath); cpErr != nil {
				return rollbackToOld(fmt.Errorf("mover snapshot para o novo local: %w", cpErr))
			}
			_ = os.Remove(tmpTarget)
		}
	}

	// 5. Abre o novo store (executa migrações pendentes + EnsureDataCompliance).
	newStore, err := openNoteStore(newPath)
	if err != nil {
		return rollbackToOld(fmt.Errorf("abrir banco no novo local: %w", err))
	}
	if _, err := newStore.EnsureDataCompliance(); err != nil {
		_ = newStore.close()
		return rollbackToOld(fmt.Errorf("validar conformidade do novo banco: %w", err))
	}

	a.store = newStore
	if clearCustomConfig {
		if err := saveConfiguredDatabasePath(""); err != nil {
			return "", fmt.Errorf("limpar caminho customizado na configuração: %w", err)
		}
	} else {
		if err := saveConfiguredDatabasePath(newPath); err != nil {
			return "", fmt.Errorf("salvar novo caminho na configuração: %w", err)
		}
	}

	return newPath, nil
}

