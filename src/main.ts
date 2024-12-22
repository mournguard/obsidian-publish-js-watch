import { registerAPI } from '@vanakat/plugin-api'
import { unwatchFile, watchFile } from 'fs'
import { App, DataAdapter, Notice, Plugin, setIcon } from 'obsidian'
import { setTimeout } from 'timers/promises'

const THROTTLE: number = 1337

export default class PublishJsWatch extends Plugin {
	private path: string = (this.app.vault.adapter as DataAdapter & {basePath: string}).basePath + '/publish.js'
	private watching: boolean = false
	private status: HTMLElement
	private button: HTMLElement
	private warning: HTMLElement | null
	private originalSave: Function
	
	public app: App & any // Many hacks, didn't retype everything

	async onload() {
		this.app = (this.app as any) 
		this.app.workspace.onLayoutReady(this.init)
	}

	onunload() {
		unwatchFile(this.path)
		this.removeWarning()
	}

	private init = () => {
		registerAPI("Publish.js Watch", this, this)

		this.status = this.addStatusBarItem()
		this.button = this.addRibbonIcon(this.watching ? 'git-pull-request-arrow' : 'git-pull-request-draft', 'Publish.js Watch', (e) => this.setWatching(!this.watching))

		this.addCommand({id: 'publish-js-watch-enable', name: 'Enable', callback: () => this.setWatching(true)})
		this.addCommand({id: 'publish-js-watch-disable', name: 'Disable', callback: () => this.setWatching(false)})

		this.originalSave = this.app.commands.commands["editor:save-file"].callback
		
		this.setWatching(true)
	}

	// Bonus: Hijacking CTRL+S for publish while in watch mode
	private overrideSave = () => {
		const cmd = this.app.commands.commands["editor:save-file"]
		if (this.originalSave) {
			cmd.callback = async () => {
				this.originalSave()
				if (!this.watching) return
				await setTimeout(150) // Totally arbitrary
				this.app.commands.executeCommandById('publish:view-changes')
			}
		}
	}

	private setWatching = (watching: boolean) => {
		if(this.watching == watching) return
		
		setIcon(this.button, watching ? 'git-pull-request-arrow' : 'git-pull-request-draft')
		new Notice(watching ? 'Publish.js Watch: Started watching.' : 'Publish.js Watch: Stopped watching.')
		this.status.setText(watching ? "| publish.js 👀 |" : "")

		if (watching) {
			watchFile(this.path, {interval: THROTTLE}, (current, preview) => this.sync())
			if (this.app.internalPlugins.plugins["publish"].instance.modal) {
				this.addWarning()
			}
		} else {
			unwatchFile(this.path)
			this.removeWarning()
		}

		this.overrideSave()

		this.watching = watching
	}

	private sync = () => {
		let file = this.app.vault.getFileByPath("publish.js")
		if (!file) return
		
		if (!this.app?.internalPlugins?.plugins["publish"]?.instance) {
			new Notice("Publish.js Watch: `Publish` plugin missing.")
			this.unload()
			return
		}

		if (!this.app.internalPlugins.plugins["publish"].instance.modal || !this.warning) {
			this.app.internalPlugins.plugins["publish"].instance.uploadFile(file)
			this.addWarning()
		} else {
			this.status.setText(this.watching ? "| publish.js 🚀 |" : "")
			this.app.internalPlugins.plugins["publish"].instance.modal.uploadProgressSection.addChanges([{path: file.path, ctime: 0, mtime: 0, size: 0, type: "new", checked: !0}])
			this.app.internalPlugins.plugins["publish"].instance.modal.uploadProgressSection.show()
			app.internalPlugins.plugins["publish"].instance.modal.uploadProgressSection.startUpload().then(() => {
				this.status.setText(this.watching ? "| publish.js 👀 |" : "")
			})
		}
	}

	private addWarning = () => {
		this.warning = createDiv()
		this.warning.classList.add("list-item-parent", "upload-progress-container", "is-finished")
		let elem = createDiv()
		elem.classList.add("publish-upload-item", "list-item")
		elem.style.color = "var(--text-warning)"
		elem.style.backgroundColor = "var(--background-primary-alt)"
		elem.style.borderRadius = "var(--radius-s)"
		elem.appendText("Automatic upload of `publish.js` is enabled, subsequent uploads will not open the modal.")
		this.warning.appendChild(elem)

		this.app.internalPlugins.plugins["publish"].instance.modal.uploadProgressSection.changesContainer.parentElement.insertBefore(
			this.warning,
			this.app.internalPlugins.plugins["publish"].instance.modal.uploadProgressSection.changesContainer
		)
	}

	private removeWarning = () => {
		this.warning?.remove()
	}
}