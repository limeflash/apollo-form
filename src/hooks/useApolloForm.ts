import FormManager from '../FormManager';
import React from 'react';
import { useApolloClient } from '@apollo/client';
import { FormManagerParams } from '../types';
import isEqual from 'lodash/isEqual';

export type IuseFormProps<S extends object> = Omit<FormManagerParams<S>, 'apolloClient'> & {
   resetOnUnmount?: boolean;
   removeOnUnmount?: boolean;
};

function useApolloForm<S extends object>({
   resetOnUnmount,
   removeOnUnmount,
   enableReinitialize,
   initialState,
   ...props
}: IuseFormProps<S>) {
   const mountedRef = React.useRef(false);
   const apolloClient = useApolloClient();
   const { current: manager } = React.useRef(
      new FormManager<S>({ ...props, initialState, apolloClient }),
   );

   React.useEffect(() => {
      if (enableReinitialize && mountedRef.current) {
         setTimeout(() => {
            if (!isEqual(manager.getInitialState(), initialState)) {
               manager.reset(initialState);
            }
         });
      }
      mountedRef.current = true;
   }, [initialState, mountedRef, enableReinitialize]);

   React.useEffect(() => {
      return () => {
         if (removeOnUnmount) {
            setTimeout(() => {
               apolloClient.cache.evict({ id: 'ROOT_QUERY', fieldName: manager.name });
            }, 100);
         } else {
            if (resetOnUnmount) {
               setTimeout(() => {
                  manager.reset();
               }, 100);
            }
         }
      };
   }, [resetOnUnmount, removeOnUnmount, manager]);

   return manager;
}

export default useApolloForm;
