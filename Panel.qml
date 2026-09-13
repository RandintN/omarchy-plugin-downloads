import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "robson.downloads"
  ipcTarget: "robson.downloads"
  manageIpc: false

  property var anchorItem: null
  property bool openedFromHotkey: false

  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  property var downloadsList: []
  onDownloadsListChanged: {
    if (root.opened && (!root.downloadsList || root.downloadsList.length === 0)) {
      root.close()
    }
  }

  function open() {
    openedFromHotkey = false
    setCenterHoverRevealSuppressed(false)
    root.controller.show()
  }

  function openFromHotkey() {
    openedFromHotkey = true
    root.controller.show()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && typeof root.bar.setCenterHoverRevealSuppressed === "function")
      root.bar.setCenterHoverRevealSuppressed(value)
    else if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  Process {
    id: cmdClearProc
    command: ["omarchy-download-manager", "--clear"]
  }

  Process {
    id: cmdCancelProc
  }

  Process {
    id: cmdRemoveProc
  }

  function clearCompleted() {
    cmdClearProc.running = true
  }

  function cancelDownload(id) {
    cmdCancelProc.command = ["omarchy-download-manager", "--cancel", id]
    cmdCancelProc.running = true
  }

  function removeDownload(id) {
    cmdRemoveProc.command = ["omarchy-download-manager", "--remove", id]
    cmdRemoveProc.running = true
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    contentWidth: panel.fittedContentWidth(Style.space(340))
    contentHeight: panel.fittedContentHeight(mainColumn.implicitHeight)

    PanelKeyCatcher {
      anchors.fill: parent
      onCloseRequested: root.close()

      Column {
        id: mainColumn
        width: parent.width
        spacing: Style.spacing.md

        RowLayout {
          width: parent.width
          height: 30

          Text {
            text: "Downloads"
            font.pixelSize: Style.font.title
            font.bold: true
            color: Color.foreground
            Layout.alignment: Qt.AlignVCenter
          }

          Item { Layout.fillWidth: true }

          Button {
            text: "Clear"
            bordered: true
            onClicked: root.clearCompleted()
            Layout.alignment: Qt.AlignVCenter
            visible: root.downloadsList.length > 0
            Accessible.name: qsTr("Clear completed downloads")
            Accessible.role: Accessible.Button
          }

          Button {
            text: "󰅖"
            onClicked: root.close()
            Layout.alignment: Qt.AlignVCenter
            Accessible.name: qsTr("Close downloads panel")
            Accessible.role: Accessible.Button
          }
        }

        PanelSeparator { width: parent.width }

        ListView {
          id: downloadsListView
          width: parent.width
          height: Math.min(contentHeight, 380)
          spacing: 8
          clip: true
          keyNavigationEnabled: true
          activeFocusOnTab: true
          model: root.downloadsList

          delegate: Item {
            id: delegateRoot
            width: ListView.view.width
            height: itemColumn.implicitHeight + 16

            HoverHandler {
              id: itemHover
            }

            Rectangle {
              anchors.fill: parent
              radius: Style.cornerRadius
              color: (itemHover.hovered || delegateRoot.activeFocus) ? Style.selectedFillFor(Color.foreground, Color.accent) : "transparent"
              border.width: delegateRoot.activeFocus ? 2 : 0
              border.color: Color.accent
            }

            Column {
              id: itemColumn
              anchors.fill: parent
              anchors.margins: 8
              spacing: 6

              RowLayout {
                width: parent.width

                Text {
                  text: modelData.title || "Untitled"
                  textFormat: Text.PlainText
                  elide: Text.ElideRight
                  font.pixelSize: Style.font.body
                  color: Color.foreground
                  Layout.fillWidth: true
                }

                // Status ou porcentagem
                Item {
                  width: Math.max(36, percentText.implicitWidth)
                  height: percentText.implicitHeight

                  Text {
                    id: percentText
                    anchors.right: parent.right
                    text: modelData.status === "completed" ? "󰄬" : (modelData.status === "failed" ? "󰅚" : (modelData.status === "queued" ? "Queued" : (Math.round(modelData.percent || 0).toLocaleString(Qt.locale(), 'f', 0) + "%")))
                    color: modelData.status === "failed" ? Color.urgent : (modelData.status === "completed" ? Color.accent : Color.muted)
                    font.pixelSize: Style.font.caption
                  }
                }

                // Remove button with minimum touch target size of 32x32px
                Item {
                  width: 32
                  height: 32

                  HoverHandler {
                    id: removeHover
                  }

                  Rectangle {
                    anchors.fill: parent
                    radius: Style.cornerRadius
                    color: removeHover.hovered ? Util.alpha(Color.urgent, 0.22) : "transparent"
                  }

                  Text {
                    id: removeItemText
                    anchors.centerIn: parent
                    text: "󰅖"
                    font.pixelSize: Style.font.body
                    color: removeHover.hovered ? Color.urgent : Color.muted
                    opacity: (itemHover.hovered || delegateRoot.activeFocus) ? 1.0 : 0.35
                  }

                  MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    acceptedButtons: Qt.LeftButton
                    onClicked: function(mouse) {
                      root.removeDownload(modelData.id)
                    }
                  }
                }
              }

              // Barra de progresso ultra-leve otimizada para o SceneGraph da GPU (sem objetos extras)
              Rectangle {
                width: parent.width
                height: 6
                radius: 3
                color: Style.selectedFillFor(Color.foreground, Color.accent)

                Rectangle {
                  width: parent.width * (Math.max(0, Math.min(100, modelData.percent || 0)) / 100)
                  height: parent.height
                  radius: 3
                  color: modelData.status === "completed" ? Color.accent : (modelData.status === "failed" ? Color.urgent : Color.accent)

                  Behavior on width {
                    NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
                  }
                }
              }

              RowLayout {
                width: parent.width
                visible: modelData.status !== "downloading" || cancelItem.visible

                Text {
                  text: modelData.status === "downloading" ? "" : (modelData.status === "completed" ? "Completed" : (modelData.error || "Failed"))
                  textFormat: Text.PlainText
                  font.pixelSize: Style.font.caption
                  color: modelData.status === "failed" ? Color.urgent : Color.muted
                  visible: modelData.status !== "downloading"
                  Layout.fillWidth: true
                }

                Item { Layout.fillWidth: true; visible: modelData.status === "downloading" }

                Item {
                  id: cancelItem
                  width: cancelText.implicitWidth + 12
                  height: cancelText.implicitHeight + 8
                  visible: modelData.status === "downloading"

                  HoverHandler {
                    id: cancelHover
                  }

                  Rectangle {
                    anchors.fill: parent
                    radius: Style.cornerRadius
                    color: cancelHover.hovered ? Util.alpha(Color.urgent, 0.22) : "transparent"
                  }

                  Text {
                    id: cancelText
                    anchors.centerIn: parent
                    text: "Cancel"
                    font.pixelSize: Style.font.caption
                    color: Color.urgent
                  }

                  MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    acceptedButtons: Qt.LeftButton
                    onClicked: function(mouse) {
                      root.cancelDownload(modelData.id)
                    }
                  }
                }
              }
            }
          }
        }

        Text {
          text: "No recent downloads"
          visible: root.downloadsList.length === 0
          color: Color.muted
          font.pixelSize: Style.font.body
          horizontalAlignment: Text.AlignHCenter
          width: parent.width
        }
      }
    }
  }
}
