import React from 'react'
import { useAppContext } from "../context/AppContext";
import AppLoader from './AppLoader';

const IsAppLoader = () => {

     const { loading } = useAppContext();

  return (
    <>
         {loading && <AppLoader />}
    </>
  )
}

export default IsAppLoader