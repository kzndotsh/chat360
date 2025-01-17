import { create } from 'zustand';
import { logger } from '@/lib/utils/logger';

type ModalType = 'join' | 'edit' | null;

interface ModalData {
  name?: string;
  avatar?: string;
  game?: string;
}

interface ModalStore {
  activeModal: ModalType;
  modalData: ModalData | null;
  showModal: (type: ModalType, data?: ModalData | null) => void;
  hideModal: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  activeModal: null,
  modalData: null,
  showModal: (type, data = null) => {
    logger.debug('Showing modal', {
      component: 'useModalStore',
      action: 'showModal',
      metadata: {
        type,
        data,
        timestamp: Date.now(),
        transition: {
          from: null, // Will be filled by zustand's previous state
          to: type,
          hasData: !!data,
        },
      },
    });
    set((state) => {
      logger.debug('Modal state transition', {
        component: 'useModalStore',
        action: 'stateTransition',
        metadata: {
          from: state.activeModal,
          to: type,
          hadData: !!state.modalData,
          willHaveData: !!data,
          timestamp: Date.now(),
        },
      });
      return { activeModal: type, modalData: data };
    });
  },
  hideModal: () => {
    logger.debug('Hiding modal', {
      component: 'useModalStore',
      action: 'hideModal',
      metadata: {
        timestamp: Date.now(),
      },
    });
    set((state) => {
      logger.debug('Modal state transition', {
        component: 'useModalStore',
        action: 'stateTransition',
        metadata: {
          from: state.activeModal,
          to: null,
          hadData: !!state.modalData,
          willHaveData: false,
          timestamp: Date.now(),
        },
      });
      return { activeModal: null, modalData: null };
    });
  },
}));
