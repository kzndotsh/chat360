import { create } from 'zustand';

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
  showModal: (type, data = null) => set({ activeModal: type, modalData: data }),
  hideModal: () => set({ activeModal: null, modalData: null }),
}));
