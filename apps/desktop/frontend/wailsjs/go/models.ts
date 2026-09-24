export namespace main {
	
	export class Folder {
	    id: string;
	    name: string;
	    parentId?: string;
	    noteCount: number;
	
	    static createFrom(source: any = {}) {
	        return new Folder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parentId = source["parentId"];
	        this.noteCount = source["noteCount"];
	    }
	}
	export class SmartFolder {
	    id: string;
	    name: string;
	    ruleKind: string;
	    tagId: string;
	    dateField: string;
	    dateRange: string;
	    checklistState: string;
	
	    static createFrom(source: any = {}) {
	        return new SmartFolder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.ruleKind = source["ruleKind"];
	        this.tagId = source["tagId"];
	        this.dateField = source["dateField"];
	        this.dateRange = source["dateRange"];
	        this.checklistState = source["checklistState"];
	    }
	}
	export class Tag {
	    id: string;
	    name: string;
	    noteCount: number;
	
	    static createFrom(source: any = {}) {
	        return new Tag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.noteCount = source["noteCount"];
	    }
	}
	export class Navigation {
	    folders: Folder[];
	    tags: Tag[];
	    smartFolders: SmartFolder[];
	
	    static createFrom(source: any = {}) {
	        return new Navigation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folders = this.convertValues(source["folders"], Folder);
	        this.tags = this.convertValues(source["tags"], Tag);
	        this.smartFolders = this.convertValues(source["smartFolders"], SmartFolder);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Note {
	    id: string;
	    title: string;
	    body: string;
	    bodyText: string;
	    folder: string;
	    folderId: string;
	    revision: number;
	    // Go type: time
	    pinnedAt?: any;
	    tags: string[];
	    checklistTotal: number;
	    checklistOpen: number;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    // Go type: time
	    deletedAt?: any;
	
	    static createFrom(source: any = {}) {
	        return new Note(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.body = source["body"];
	        this.bodyText = source["bodyText"];
	        this.folder = source["folder"];
	        this.folderId = source["folderId"];
	        this.revision = source["revision"];
	        this.pinnedAt = this.convertValues(source["pinnedAt"], null);
	        this.tags = source["tags"];
	        this.checklistTotal = source["checklistTotal"];
	        this.checklistOpen = source["checklistOpen"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.deletedAt = this.convertValues(source["deletedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NoteQuery {
	    kind: string;
	    id: string;
	
	    static createFrom(source: any = {}) {
	        return new NoteQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.id = source["id"];
	    }
	}
	
	export class SyncConfiguration {
	    tursoDatabaseUrl: string;
	    configured: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SyncConfiguration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tursoDatabaseUrl = source["tursoDatabaseUrl"];
	        this.configured = source["configured"];
	    }
	}
	export class SyncResult {
	    uploaded: number;
	    downloaded: number;
	    conflicts: number;
	    message: string;
	    syncedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SyncResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uploaded = source["uploaded"];
	        this.downloaded = source["downloaded"];
	        this.conflicts = source["conflicts"];
	        this.message = source["message"];
	        this.syncedAt = source["syncedAt"];
	    }
	}

}

