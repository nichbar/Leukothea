import React, {
	createContext,
	FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { get, isEqual } from 'lodash';
import { cn } from '@bem-react/classname';

import { LayoutFlow } from '../../../components/layouts/LayoutFlow/LayoutFlow';
import { ModalLayout } from '../../../components/layouts/ModalLayout/ModalLayout';
import { Page } from '../../../components/layouts/Page/Page';
import { Button } from '../../../components/primitives/Button/Button.bundle/universal';
import { Modal } from '../../../components/primitives/Modal/Modal.bundle/desktop';
import { ToastMessages } from '../../../components/primitives/ToastMessages/ToastMessages';
import { useToastMessages } from '../../../components/primitives/ToastMessages/useToastMessages';
import { isMobileBrowser } from '../../../lib/browser';
import { openFileDialog, readAsText, saveFile } from '../../../lib/files';
import { getMessage } from '../../../lib/language';
// Requests
import { clearCache as clearCacheReq } from '../../../requests/backend/clearCache';
import { getConfig } from '../../../requests/backend/getConfig';
import { listLLMModels } from '../../../requests/backend/llm/listLLMModels';
import { ping } from '../../../requests/backend/ping';
import { resetConfig as resetConfigReq } from '../../../requests/backend/resetConfig';
import { setConfig as setConfigReq } from '../../../requests/backend/setConfig';
import { forcePushWebDAVRemote } from '../../../requests/backend/sync/forcePushWebDAVRemote';
import { getWebDAVSyncStatus } from '../../../requests/backend/sync/getWebDAVSyncStatus';
import { syncWebDAVNow as syncWebDAVNowReq } from '../../../requests/backend/sync/syncWebDAVNow';
import { testWebDAVConnection } from '../../../requests/backend/sync/testWebDAVConnection';
import { getSpeakers } from '../../../requests/backend/tts/getSpeakers';
import { updateConfig as updateConfigReq } from '../../../requests/backend/updateConfig';
import { AppConfigType } from '../../../types/runtime';

import { TTSList } from './OptionsPage.components/TTSList/TTSList';
import { generateTree } from './OptionsPage.utils/generateTree';
import { OptionsGroup, OptionsTree } from './OptionsTree/OptionsTree';
import { PageSection } from './PageSection/PageSection';

import './OptionsPage.css';

export const cnOptionsPage = cn('OptionsPage');

export const OptionsModalsContext = createContext<
	React.RefObject<HTMLDivElement> | undefined
>(undefined);

type Errors = null | Record<string, string>;

interface OptionsPageProps {
	messageHideDelay?: number;
}

export const OptionsPage: FC<OptionsPageProps> = ({ messageHideDelay }) => {
	const [loaded, setLoaded] = useState<boolean>(false);

	const [config, setConfig] = useState<AppConfigType | undefined>();
	const [errors, setErrors] = useState<Errors>(null);
	const [modifiedConfig, setModifiedConfig] = useState<null | Record<string, any>>(
		null,
	);
	const [configTree, setConfigTree] = useState<OptionsGroup[] | undefined>();

	const windowsStackRef = useRef<HTMLDivElement>(null);

	const [clearCacheProcess, setClearCacheProcess] = useState<boolean>(false);

	const [ttsModules, setTTSModules] = useState<Record<string, string>>({});
	const [isTTSModulesWindowOpen, setIsTTSModulesWindowOpen] = useState(false);

	const [llmModels, setLlmModels] = useState<string[]>([]);
	const [llmModelsLoading, setLlmModelsLoading] = useState(false);
	const [llmModelsError, setLlmModelsError] = useState<string | undefined>();
	const [llmModelsFetched, setLlmModelsFetched] = useState(false);
	const llmModelsRequestIdRef = useRef(0);

	const [webdavTestProcess, setWebdavTestProcess] = useState(false);
	const [webdavSyncProcess, setWebdavSyncProcess] = useState(false);
	const [webdavForcePushProcess, setWebdavForcePushProcess] = useState(false);
	const [webdavCorruptDialogDetail, setWebdavCorruptDialogDetail] = useState<
		string | null
	>(null);
	const [webdavStatusText, setWebdavStatusText] = useState(
		getMessage('settings_option_syncWebdav_status_idle'),
	);

	const updateConfig = useCallback(() => {
		(async () => {
			await Promise.all([
				getConfig().then(setConfig),
				getSpeakers().then(setTTSModules),
			]);

			setLoaded(true);
		})();
	}, []);

	//
	// Messages broker
	//

	const { messages, addMessage, deleteMessage, haltMessages } = useToastMessages({
		hideDelay: messageHideDelay,
	});

	const handleError = useCallback(
		(error: any) => {
			if (typeof error === 'string') {
				addMessage(error, 'error');
			} else if (error instanceof Error) {
				addMessage(error.message, 'error');
			} else {
				const unknownMessage = getMessage('message_unknownError');
				addMessage(unknownMessage, 'error');

				console.error(error);
				console.error('Unknown error object above ^');
			}
		},
		[addMessage],
	);

	//
	// Config control
	//

	const importConfig = useCallback(() => {
		openFileDialog()
			.then((files) => {
				if (files === null) return null;

				return readAsText(files[0]);
			})
			.then((rawData) => {
				if (rawData === null) return;

				try {
					const configData = JSON.parse(rawData);

					setConfigReq(configData)
						.then(updateConfig)
						.then(() => {
							addMessage(
								getMessage('settings_message_importConfig_success'),
								'info',
							);
						})
						.catch(handleError);
				} catch (_error) {
					addMessage(
						getMessage('settings_message_importConfig_invalidFile'),
						'error',
					);
				}
			});
	}, [addMessage, handleError, updateConfig]);

	const exportConfig = useCallback(() => {
		const dump = JSON.stringify(config);
		const file = new Blob([dump], { type: 'application/json' });

		saveFile(file, `leukothea-config_${new Date().getTime()}.json`);
	}, [config]);

	const resetConfig = useCallback(() => {
		const isConfirmed = confirm(getMessage('settings_message_resetConfig_confirm'));
		if (!isConfirmed) return;

		resetConfigReq()
			.then(updateConfig)
			.then(() => {
				addMessage(getMessage('settings_message_resetConfig_success'), 'info');
			})
			.catch(handleError);
	}, [addMessage, handleError, updateConfig]);

	//
	// Changes control
	//

	const cancelChanges = useCallback(() => {
		setModifiedConfig(null);
		setErrors(null);
	}, []);

	const saveChanges = useCallback(async (): Promise<boolean> => {
		// Skip empty changes
		if (modifiedConfig === null) return true;

		try {
			const { success, errors } = await updateConfigReq(modifiedConfig);
			if (!success) {
				setErrors(errors);
				return false;
			}

			const nextConfig = await getConfig();
			setConfig(nextConfig);
			setModifiedConfig(null);
			setErrors(null);
			addMessage(getMessage('settings_message_saveChanges_success'), 'info');
			return true;
		} catch (error) {
			handleError(error);
			return false;
		}
	}, [addMessage, handleError, modifiedConfig]);

	//
	// Config actions
	//

	const clearCache = useCallback(() => {
		setClearCacheProcess(true);
		clearCacheReq()
			.then(() => {
				addMessage(getMessage('settings_message_clearCache_success'), 'info');
			})
			.catch(handleError)
			.finally(() => {
				setClearCacheProcess(false);
			});
	}, [addMessage, handleError]);

	const formatWebDAVStatus = useCallback(
		(status: {
			lastSyncAt: number | null;
			lastError: string | null;
			lastDirection: string | null;
		}) => {
			if (status.lastError) {
				return getMessage(
					'settings_option_syncWebdav_status_error',
					status.lastError,
				);
			}
			if (status.lastSyncAt == null) {
				return getMessage('settings_option_syncWebdav_status_idle');
			}
			const time = new Date(status.lastSyncAt).toLocaleString();
			// 'none' = reconcile succeeded with no transfer (local and remote already equal)
			const directionKey =
				status.lastDirection === 'push'
					? 'settings_option_syncWebdav_direction_push'
					: status.lastDirection === 'pull'
						? 'settings_option_syncWebdav_direction_pull'
						: 'settings_option_syncWebdav_direction_none';
			const direction = getMessage(directionKey);
			return getMessage('settings_option_syncWebdav_status_ok', [time, direction]);
		},
		[],
	);

	const closeWebdavCorruptDialog = useCallback(() => {
		setWebdavCorruptDialogDetail(null);
	}, []);

	const refreshWebDAVStatus = useCallback(async () => {
		try {
			const status = await getWebDAVSyncStatus();
			setWebdavStatusText(formatWebDAVStatus(status));
		} catch (error) {
			// Keep previous text; surface only unexpected failures in console
			console.error('Failed to load WebDAV sync status', error);
		}
	}, [formatWebDAVStatus]);

	const getMergedWebDAVCredentials = useCallback(() => {
		return {
			url:
				(modifiedConfig?.['sync.webdav.url'] as string | undefined) ??
				config?.sync?.webdav?.url ??
				'',
			username:
				(modifiedConfig?.['sync.webdav.username'] as string | undefined) ??
				config?.sync?.webdav?.username ??
				'',
			password:
				(modifiedConfig?.['sync.webdav.password'] as string | undefined) ??
				config?.sync?.webdav?.password ??
				'',
		};
	}, [config, modifiedConfig]);

	const testWebDAV = useCallback(() => {
		setWebdavTestProcess(true);
		const credentials = getMergedWebDAVCredentials();
		testWebDAVConnection(credentials)
			.then((result) => {
				if (result.ok) {
					addMessage(
						getMessage('settings_message_syncWebdav_test_success'),
						'info',
					);
				} else {
					addMessage(
						getMessage(
							'settings_message_syncWebdav_test_failed',
							result.error ?? 'Unknown error',
						),
						'error',
					);
				}
			})
			.catch(handleError)
			.finally(() => {
				setWebdavTestProcess(false);
			});
	}, [addMessage, getMergedWebDAVCredentials, handleError]);

	const syncWebDAVNow = useCallback(() => {
		setWebdavSyncProcess(true);
		(async () => {
			try {
				// Sync uses saved storage, not the form draft. Persist first so
				// enable/url/credentials just typed are actually used.
				const saved = await saveChanges();
				if (!saved) {
					addMessage(
						getMessage(
							'settings_message_syncWebdav_sync_failed',
							getMessage('settings_message_syncWebdav_save_required'),
						),
						'error',
					);
					return;
				}

				// Same credential source as Test connection (form draft + saved).
				const status = await syncWebDAVNowReq(getMergedWebDAVCredentials());
				setWebdavStatusText(formatWebDAVStatus(status));
				if (status.recovery === 'forcePushInvalidRemote') {
					// Dialog is the primary surface for corrupt-remote recovery.
					setWebdavCorruptDialogDetail(
						status.lastError ?? 'Remote config failed AppConfig validation',
					);
				} else if (status.lastError) {
					addMessage(
						getMessage(
							'settings_message_syncWebdav_sync_failed',
							status.lastError,
						),
						'error',
					);
				} else if (status.lastSyncAt == null) {
					// Defensive: reconcile returned without recording a sync cycle.
					addMessage(
						getMessage(
							'settings_message_syncWebdav_sync_failed',
							getMessage('settings_message_syncWebdav_not_configured'),
						),
						'error',
					);
				} else {
					addMessage(
						getMessage('settings_message_syncWebdav_sync_success'),
						'info',
					);
				}
				// Config may have changed on pull
				await updateConfig();
			} catch (error) {
				handleError(error);
			} finally {
				setWebdavSyncProcess(false);
			}
		})();
	}, [
		addMessage,
		formatWebDAVStatus,
		getMergedWebDAVCredentials,
		handleError,
		saveChanges,
		updateConfig,
	]);

	const forcePushWebDAV = useCallback(() => {
		setWebdavForcePushProcess(true);
		(async () => {
			try {
				const status = await forcePushWebDAVRemote(getMergedWebDAVCredentials());
				setWebdavStatusText(formatWebDAVStatus(status));
				if (status.lastError) {
					addMessage(
						getMessage(
							'settings_message_syncWebdav_forcePush_failed',
							status.lastError,
						),
						'error',
					);
					// Keep dialog open when still recoverable so the user can retry.
					if (status.recovery !== 'forcePushInvalidRemote') {
						closeWebdavCorruptDialog();
					} else if (status.lastError) {
						setWebdavCorruptDialogDetail(status.lastError);
					}
				} else {
					closeWebdavCorruptDialog();
					addMessage(
						getMessage('settings_message_syncWebdav_forcePush_success'),
						'info',
					);
				}
			} catch (error) {
				handleError(error);
			} finally {
				setWebdavForcePushProcess(false);
			}
		})();
	}, [
		addMessage,
		closeWebdavCorruptDialog,
		formatWebDAVStatus,
		getMergedWebDAVCredentials,
		handleError,
	]);

	const getMergedLlmCredentials = useCallback(() => {
		const apiUrl =
			(modifiedConfig?.['llmTranslator.apiUrl'] as string | undefined) ??
			config?.llmTranslator?.apiUrl ??
			'';
		const apiKey =
			(modifiedConfig?.['llmTranslator.apiKey'] as string | undefined) ??
			config?.llmTranslator?.apiKey ??
			'';
		return { apiUrl, apiKey };
	}, [config, modifiedConfig]);

	const refreshLLMModels = useCallback(async () => {
		const { apiUrl, apiKey } = getMergedLlmCredentials();
		const requestId = ++llmModelsRequestIdRef.current;

		// Skip network when URL is empty; free-text model field still works.
		if (!apiUrl.trim()) {
			setLlmModels([]);
			setLlmModelsError(undefined);
			setLlmModelsFetched(false);
			setLlmModelsLoading(false);
			return;
		}

		setLlmModelsLoading(true);
		setLlmModelsError(undefined);

		try {
			const result = await listLLMModels({
				apiUrl,
				apiKey: apiKey || undefined,
			});
			if (requestId !== llmModelsRequestIdRef.current) return;

			setLlmModels(result.models);
			setLlmModelsError(result.error);
			setLlmModelsFetched(true);
		} catch (error) {
			if (requestId !== llmModelsRequestIdRef.current) return;
			const message =
				error instanceof Error ? error.message : 'Failed to load models';
			setLlmModels([]);
			setLlmModelsError(message);
			setLlmModelsFetched(true);
		} finally {
			if (requestId === llmModelsRequestIdRef.current) {
				setLlmModelsLoading(false);
			}
		}
	}, [getMergedLlmCredentials]);

	//
	// Utils
	//

	const setOptionValue = useCallback(
		(inputPath: string, value: any) => {
			// Copy current object
			let modifiedConfigLocal: Record<string, any> | null = {};
			for (const path in modifiedConfig) {
				const configItem = get(config, path);

				// Copy only if it different from config value
				if (!isEqual(configItem, modifiedConfig[path])) {
					modifiedConfigLocal[path] = modifiedConfig[path];
				}
			}

			// Set value if not exist equal
			const modConfigItem = get(modifiedConfig, inputPath);
			if (!isEqual(modConfigItem, value)) {
				const configItem = get(config, inputPath);
				if (isEqual(configItem, value)) {
					delete modifiedConfigLocal[inputPath];
				} else {
					modifiedConfigLocal[inputPath] = value;
				}
			}

			if (Object.keys(modifiedConfigLocal).length === 0) {
				modifiedConfigLocal = null;
			}

			setModifiedConfig(modifiedConfigLocal);

			// Remove error for option
			if (errors !== null && inputPath in errors) {
				let errorsLocal: Errors = { ...errors };

				delete errorsLocal[inputPath];
				if (Object.keys(errorsLocal).length === 0) {
					errorsLocal = null;
				}

				setErrors(errorsLocal);
			}
		},
		[config, errors, modifiedConfig],
	);

	// Init
	useEffect(() => {
		ping().then(updateConfig);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Load WebDAV sync status when options page is ready
	useEffect(() => {
		if (!loaded) return;
		void refreshWebDAVStatus();
	}, [loaded, refreshWebDAVStatus]);

	// Load model suggestions when saved LLM credentials change (not on every keystroke).
	useEffect(() => {
		if (!loaded || config === undefined) return;
		void refreshLLMModels();
		// refreshLLMModels depends on modifiedConfig merge for manual refresh;
		// auto-load intentionally tracks only saved apiUrl/apiKey.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loaded, config?.llmTranslator?.apiUrl, config?.llmTranslator?.apiKey]);

	// Effective WebDAV enable (saved value + unsaved checkbox edits).
	const webdavEnabled =
		typeof modifiedConfig?.['sync.webdav.enabled'] === 'boolean'
			? modifiedConfig['sync.webdav.enabled']
			: (config?.sync?.webdav?.enabled ?? false);

	// Update config tree
	useEffect(() => {
		const configTree = generateTree({
			clearCacheProcess,
			ttsModules,
			clearCache,
			toggleTTSModulesWindow: () => {
				setIsTTSModulesWindowOpen((value) => !value);
			},
			llmModels,
			llmModelsLoading,
			llmModelsError,
			llmModelsFetched,
			refreshLLMModels,
			webdavTestProcess,
			webdavSyncProcess,
			webdavStatusText,
			webdavEnabled,
			testWebDAV,
			syncWebDAVNow,
		});

		setConfigTree(configTree);
	}, [
		clearCacheProcess,
		clearCache,
		ttsModules,
		llmModels,
		llmModelsLoading,
		llmModelsError,
		llmModelsFetched,
		refreshLLMModels,
		webdavTestProcess,
		webdavSyncProcess,
		webdavStatusText,
		webdavEnabled,
		testWebDAV,
		syncWebDAVNow,
	]);

	//
	// Render
	//

	const isMobile = useMemo(() => isMobileBrowser(), []);

	if (!loaded || config === undefined || configTree === undefined) {
		return <Page loading />;
	}

	const editMode = modifiedConfig !== null;
	return (
		<Page>
			<div className={cnOptionsPage()}>
				<div className={cnOptionsPage('Page', { editMode })}>
					<PageSection title={getMessage('settings_pageTitle')} level={1}>
						<div
							className={cnOptionsPage('Container', {}, [
								cnOptionsPage('IndentMixin', { horizontal: true }),
							])}
						>
							<LayoutFlow
								direction={isMobile ? 'vertical' : 'horizontal'}
								indent="l"
							>
								<Button
									view="action"
									onPress={resetConfig}
									width={isMobile ? 'max' : undefined}
								>
									{getMessage('settings_button_reset')}
								</Button>
								<Button
									onPress={importConfig}
									width={isMobile ? 'max' : undefined}
								>
									{getMessage('settings_button_import')}
								</Button>
								{!isMobile && (
									<Button
										onPress={exportConfig}
										width={isMobile ? 'max' : undefined}
									>
										{getMessage('settings_button_export')}
									</Button>
								)}
							</LayoutFlow>
						</div>

						<div className={cnOptionsPage('OptionsTree')}>
							<OptionsTree
								tree={configTree}
								errors={errors ?? undefined}
								config={config}
								modifiedConfig={modifiedConfig}
								setOptionValue={setOptionValue}
							/>
						</div>
					</PageSection>

					<ToastMessages
						messages={messages}
						haltMessages={haltMessages}
						deleteMessage={deleteMessage}
					/>
				</div>

				{editMode ? (
					<div
						className={cnOptionsPage('ConfirmMenu', {}, [
							cnOptionsPage('IndentMixin', { horizontal: true }),
						])}
					>
						<Button view="action" onPress={saveChanges}>
							{getMessage('settings_button_saveChanges')}
						</Button>
						<Button view="default" onPress={cancelChanges}>
							{getMessage('settings_button_cancel')}
						</Button>
					</div>
				) : undefined}

				<div ref={windowsStackRef} />

				<OptionsModalsContext.Provider value={windowsStackRef}>
					<TTSList
						visible={isTTSModulesWindowOpen}
						onClose={() => {
							setIsTTSModulesWindowOpen(false);
						}}
						updateConfig={updateConfig}
					/>
					<Modal
						visible={webdavCorruptDialogDetail != null}
						onClose={closeWebdavCorruptDialog}
						scope={windowsStackRef}
						preventBodyScroll
					>
						<div className={cnOptionsPage('WebdavCorruptDialog')}>
							<ModalLayout
								title={getMessage(
									'settings_dialog_syncWebdav_corruptRemote_title',
								)}
								footer={[
									<Button
										key="force"
										view="action"
										disabled={webdavForcePushProcess}
										onPress={forcePushWebDAV}
									>
										{getMessage(
											'settings_dialog_syncWebdav_corruptRemote_forcePush',
										)}
									</Button>,
									<Button
										key="cancel"
										disabled={webdavForcePushProcess}
										onPress={closeWebdavCorruptDialog}
									>
										{getMessage(
											'settings_dialog_syncWebdav_corruptRemote_cancel',
										)}
									</Button>,
								]}
							>
								<LayoutFlow direction="vertical" indent="m">
									<p className={cnOptionsPage('WebdavCorruptIntro')}>
										{getMessage(
											'settings_dialog_syncWebdav_corruptRemote_intro',
										)}
									</p>
									<div
										className={cnOptionsPage(
											'WebdavCorruptBlockedBy',
										)}
									>
										<div
											className={cnOptionsPage(
												'WebdavCorruptBlockedByLabel',
											)}
										>
											{getMessage(
												'settings_dialog_syncWebdav_corruptRemote_blockedBy',
											)}
										</div>
										<pre
											className={cnOptionsPage(
												'WebdavCorruptBlockedByDetail',
											)}
										>
											{webdavCorruptDialogDetail ?? ''}
										</pre>
									</div>
									<p
										className={cnOptionsPage(
											'WebdavCorruptForcePushWarning',
										)}
									>
										{getMessage(
											'settings_dialog_syncWebdav_corruptRemote_forcePushWarning',
										)}
									</p>
								</LayoutFlow>
							</ModalLayout>
						</div>
					</Modal>
				</OptionsModalsContext.Provider>
			</div>
		</Page>
	);
};
