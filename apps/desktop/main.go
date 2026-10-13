package main

import (
	"embed"
	_ "embed"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	focusNoteID := ""
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "--focus-note=") {
			focusNoteID = strings.TrimPrefix(arg, "--focus-note=")
			break
		}
	}

	app, err := NewApp("")
	if err != nil {
		log.Fatal(err)
	}
	defer app.Close()

	app.focusNoteID = focusNoteID

	windowTitle := "Magnetares Notes"
	windowWidth := 1240
	windowHeight := 780
	minWidth := 960
	minHeight := 640

	winOpts := &windows.Options{
		WebviewIsTransparent: false,
		WindowIsTranslucent:  false,
		DisableWindowIcon:    false,
	}

	if portableDir := getPortableDataDir(); portableDir != "" {
		winOpts.WebviewUserDataPath = filepath.Join(portableDir, "webview")
	}

	if focusNoteID != "" {
		windowTitle = "Modo Foco — Magnetares"
		windowWidth = 620
		windowHeight = 780
		minWidth = 420
		minHeight = 500
		winOpts.WebviewUserDataPath = filepath.Join(os.TempDir(), "magnetares_focus_webview")
	}

	err = wails.Run(&options.App{
		Title:            windowTitle,
		Frameless:        true,
		Width:            windowWidth,
		Height:           windowHeight,
		MinWidth:         minWidth,
		MinHeight:        minHeight,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 246, G: 246, B: 242, A: 255},
		OnStartup:        app.startup,
		Bind:             []interface{}{app},
		Windows:          winOpts,
		Linux: &linux.Options{
			Icon:                appIcon,
			WindowIsTranslucent: false,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHidden(),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title:   "Magnetares Notes",
				Message: "Magnetares Notes Desktop",
				Icon:    appIcon,
			},
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
