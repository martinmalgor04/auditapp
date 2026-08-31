export namespace app {
	
	export class AvisoVersionDTO {
	    versionNueva: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new AvisoVersionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.versionNueva = source["versionNueva"];
	        this.url = source["url"];
	    }
	}
	export class CredencialDTO {
	    nombre: string;
	    tipo: string;
	    usuario?: string;
	    password?: string;
	    community?: string;
	    authProtocol?: string;
	    authPassphrase?: string;
	    privProtocol?: string;
	    privPassphrase?: string;
	
	    static createFrom(source: any = {}) {
	        return new CredencialDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nombre = source["nombre"];
	        this.tipo = source["tipo"];
	        this.usuario = source["usuario"];
	        this.password = source["password"];
	        this.community = source["community"];
	        this.authProtocol = source["authProtocol"];
	        this.authPassphrase = source["authPassphrase"];
	        this.privProtocol = source["privProtocol"];
	        this.privPassphrase = source["privPassphrase"];
	    }
	}
	export class EscaneoInfoDTO {
	    escaneoId: string;
	    empresa: string;
	    auditoria: string;
	    etiqueta: string;
	    rango: string;
	    estado: string;
	    consentimientoOtorgado: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EscaneoInfoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.escaneoId = source["escaneoId"];
	        this.empresa = source["empresa"];
	        this.auditoria = source["auditoria"];
	        this.etiqueta = source["etiqueta"];
	        this.rango = source["rango"];
	        this.estado = source["estado"];
	        this.consentimientoOtorgado = source["consentimientoOtorgado"];
	    }
	}

}

export namespace scan {
	
	export class ScanProgreso {
	    EscaneoID: string;
	    Fase: string;
	    Encontrados: number;
	    Sincronizados: number;
	    ModoDegradado: boolean;
	    Advertencia: string;
	    Error: string;
	    ColaPausada: boolean;
	    PullPorcentaje: number;
	    Empresa: string;
	    Auditoria: string;
	    Etiqueta: string;
	    Rango: string;
	
	    static createFrom(source: any = {}) {
	        return new ScanProgreso(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.EscaneoID = source["EscaneoID"];
	        this.Fase = source["Fase"];
	        this.Encontrados = source["Encontrados"];
	        this.Sincronizados = source["Sincronizados"];
	        this.ModoDegradado = source["ModoDegradado"];
	        this.Advertencia = source["Advertencia"];
	        this.Error = source["Error"];
	        this.ColaPausada = source["ColaPausada"];
	        this.PullPorcentaje = source["PullPorcentaje"];
	        this.Empresa = source["Empresa"];
	        this.Auditoria = source["Auditoria"];
	        this.Etiqueta = source["Etiqueta"];
	        this.Rango = source["Rango"];
	    }
	}

}

