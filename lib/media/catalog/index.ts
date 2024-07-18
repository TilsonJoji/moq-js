import { Connection } from "../../transport"
import { asError } from "../../common/error"

export interface CommonTrackFields {
	namespace?: string
	packaging?: string
	renderGroup?: number
	altGroup?: number
}

export interface Root {
	version: number
	streamingFormat: number
	streamingFormatVersion: string
	supportsDeltaUpdates: boolean
	commonTrackFields?: CommonTrackFields
	tracks: Track[]
}

export function encode(catalog: Root): Uint8Array {
	const encoder = new TextEncoder()
	const str = JSON.stringify(catalog)
	return encoder.encode(str)
}

export function decode(raw: Uint8Array) {
	const decoder = new TextDecoder()
	const str = decoder.decode(raw)

	const catalog = JSON.parse(str)
	if (!isRoot(catalog)) {
		throw new Error("invalid catalog")
	}

	return catalog
}

export async function fetch(connection: Connection, namespace: string): Promise<Root> {
	const subscribe = await connection.subscribe(namespace, ".catalog")
	try {
		const segment = await subscribe.data()
		if (!segment) throw new Error("no catalog data")

		const chunk = await segment.read()
		if (!chunk) throw new Error("no catalog chunk")

		await segment.close()
		await subscribe.close() // we done

		return decode(chunk.payload)
	} catch (e) {
		const err = asError(e)

		// Close the subscription after we're done.
		await subscribe.close(1n, err.message)

		throw err
	}
}

export function isRoot(catalog: any): catalog is Root {
	if (!isPackagingValid(catalog)) return false
	if (!Array.isArray(catalog.tracks)) return false
	return catalog.tracks.every((track: any) => isTrack(track))
}

export interface Track {
	namespace: string
	name: string
	depends?: any[]
	packaging?: string
	renderGroup?: number
	selectionParams: SelectionParams // technically optional but not really
	altGroup?: number
	initTrack?: string
	initData?: string
}

export interface Mp4Track extends Track {
	initTrack?: string
	initData?: string
	selectionParams: Mp4SelectionParams
}

export interface SelectionParams {
	codec?: string
	mimeType?: string
	bitrate?: number
	lang?: string
}

export interface Mp4SelectionParams extends SelectionParams {
	mimeType: "video/mp4"
}

export interface AudioTrack extends Track {
	name: string
	selectionParams: AudioSelectionParams
}

export interface AudioSelectionParams extends SelectionParams {
	samplerate: number
	channelConfig: string
}

export interface VideoTrack extends Track {
	name: string
	selectionParams: VideoSelectionParams
	temporalId?: number
	spatialId?: number
}

export interface VideoSelectionParams extends SelectionParams {
	width: number
	height: number
	displayWidth?: number
	displayHeight?: number
	framerate?: number
}

export function isTrack(track: any): track is Track {
	if (typeof track.namespace !== "string") return false
	if (typeof track.name !== "string") return false
	return true
}

export function isMp4Track(track: any): track is Mp4Track {
	if (!isTrack(track)) return false
	if (typeof track.initTrack !== "string" && typeof track.initData !== "string") return false
	if (typeof track.selectionParams.mimeType !== "string") return false
	return true
}

export function isVideoTrack(track: any): track is VideoTrack {
	if (!isTrack(track)) return false
	return isVideoSelectionParams(track.selectionParams)
}

export function isVideoSelectionParams(params: any): params is VideoSelectionParams {
	if (typeof params.width !== "number") return false
	if (typeof params.height !== "number") return false
	return true
}

export function isAudioTrack(track: any): track is AudioTrack {
	if (!isTrack(track)) return false
	return isAudioSelectionParams(track.selectionParams)
}

export function isAudioSelectionParams(params: any): params is AudioSelectionParams {
	if (typeof params.channelConfig !== "string") return false
	if (typeof params.samplerate !== "number") return false
	return true
}

function isPackagingValid(catalog: any): boolean {
	//packaging if common would be listed in commonTrackFields but if fields
	//in commonTrackFields are mentiond in Tracks , the fields in Tracks precedes

	function isValidPackagingType(packaging: any): boolean {
		return packaging === "cmaf" || packaging === "loc"
	}

	if (
		catalog.commonTrackFields.packaging !== undefined &&
		!isValidPackagingType(catalog.commonTrackFields.packaging)
	) {
		return false
	}

	for (const track of catalog.tracks) {
		if (track.packaging !== undefined && !isValidPackagingType(track.packaging)) {
			return false
		}
	}

	return true
}

export function isMediaTrack(track: any): track is Track {
	if (track.name.toLowerCase().includes("audio") || track.name.toLowerCase().includes("video")) {
		return true
	}

	if (track.selectionParams && track.selectionParams.codec) {
		const codec = track.selectionParams.codec.toLowerCase()
		const acceptedCodecs = ["mp4a", "avc1"]

		for (const acceptedCodec of acceptedCodecs) {
			if (codec.includes(acceptedCodec)) {
				return true
			}
		}
	}
	return false
}
