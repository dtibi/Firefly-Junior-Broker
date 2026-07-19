import { useContext } from 'react';
import { LocaleContext } from './LocaleContext';

export function useTranslation() {
  return useContext(LocaleContext);
}
