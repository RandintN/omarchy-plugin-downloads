import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "robson.downloads"

  property var downloads: []
  property int activeCount: 0
  property bool hasRecentFinished: false
  // Mantém o ícone visível por 1h após o último item concluir/falhar,
  // permitindo revisar o resultado e usar o botão Clear
  readonly property int recentFinishedWindowMs: 60 * 60 * 1000

  function updateData(raw) {
    try {
      if (!raw) {
        root.downloads = []
        root.activeCount = 0
        root.hasRecentFinished = false
        if (panelLoader.item) panelLoader.item.downloadsList = []
        return
      }
      var data = JSON.parse(raw)
      root.downloads = data
      var count = 0
      var recent = false
      var now = Date.now()
      for (var i = 0; i < data.length; i++) {
        if (data[i].status === "downloading" || data[i].status === "queued") {
          count++
        } else if (data[i].status === "completed" || data[i].status === "failed") {
          var ts = data[i].completedAt || data[i].addedAt || 0
          if (now - ts < root.recentFinishedWindowMs) recent = true
        }
      }
      root.activeCount = count
      root.hasRecentFinished = recent
      if (panelLoader.item) panelLoader.item.downloadsList = data
    } catch (e) {
      root.downloads = []
      root.activeCount = 0
      root.hasRecentFinished = false
    }
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
    if ("downloadsList" in target) target.downloadsList = root.downloads
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  visible: activeCount > 0 || hasRecentFinished
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onActiveCountChanged: {
    if (activeCount === 0) {
      if (root.bar && typeof root.bar.hideTooltip === "function") {
        root.bar.hideTooltip(button)
      }
      root.close()
    }
  }

  onVisibleChanged: {
    if (!visible) {
      if (root.bar && typeof root.bar.hideTooltip === "function") {
        root.bar.hideTooltip(button)
      }
      root.close()
    }
  }

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  FileView {
    id: stateFile
    path: Quickshell.env("HOME") + "/.local/state/omarchy/downloads.json"
    watchChanges: true
    printErrors: false

    onFileChanged: {
      stateFile.reload()
    }

    onLoaded: {
      root.updateData(text())
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰇚"
    slotSize: Style.bar.statusSlot
    tooltipText: root.activeCount.toLocaleString(Qt.locale(), 'f', 0) + " active download(s)"
    Accessible.name: qsTr("Download Manager, %1 active").arg(root.activeCount)
    Accessible.role: Accessible.Button

    onPressed: function(b) {
      if (!root.bar) return
      root.togglePanel()
    }
  }
}
