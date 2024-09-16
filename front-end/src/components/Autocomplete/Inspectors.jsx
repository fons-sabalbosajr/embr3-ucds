import React from "react";
import { ConfigProvider, AutoComplete, Input } from "antd";
import "./inspectors.css"

// Define the list of predefined industry types for autocomplete
const InspectorOptions = [
  { value: "Engr. Climaco A. Jurado" },
  { value: "Engr. Dustin L. Tungol" },
  { value: "Engr. Ervin Ventura" },
  { value: "Engr. Glen Fredrie P. Aguilar" },
  { value: "Engr. Ian Dominic D. Limpin" },
  { value: "Engr. Joanne D. David" },
  { value: "Engr. Julie Ann M. Hertez" },
  { value: "Engr. Kristine Caroline R. Pacate" },
  { value: "Engr. Krizia Loren E. Tumalad" },
  { value: "Engr. Lily Amor C. Dizon" },
  { value: "Engr. Ma. Hadassah D. Borabon" },
  { value: "Engr. Mark Austin V. Capitulo" },
  { value: "Engr. Miller G. Limjoco" },
  { value: "Engr. Neil S. Zapata" },
  { value: "Engr. Nesty P. Mendiola" },
  { value: "Engr. Raldy R. Pagador" },
  { value: "Engr. Ranilo S. Rodriguez" },
  { value: "Engr. Shaira L. Celocia" },
  { value: "Engr. Sofia Grace S. Nacor" },
  { value: "Engr. Zyrus John M. Salazar" },
  { value: "Mr. Arke Dhomenic D. Cruz" },
  { value: "Mr. Cyrel Dave T. Sanchez" },
  { value: "Mr. Donald O. Celestial" },
  { value: "Mr. Earl Joshua M. Reyes" },
  { value: "Mr. Elvin V. Obias" },
  { value: "Mr. Ervin G. Servilla" },
  { value: "Mr. Eugene C. Mendoza" },
  { value: "Mr. Ferdinand M. De Guzman" },
  { value: "Mr. Frances Nicole C. Juanatas" },
  { value: "Mr. Gerald L. Sator" },
  { value: "Mr. Homer John P. Rosales" },
  { value: "Mr. Ian S. Villegas" },
  { value: "Mr. Janry M. Dimal" },
  { value: "Mr. John Timothy M. Lalu" },
  { value: "Mr. Joshua Kenneth Edison C. Montaces" },
  { value: "Mr. Juan L. Valeros" },
  { value: "Mr. Kenneth C. Meneses" },
  { value: "Mr. Learzi Rheynier G. Chua" },
  { value: "Mr. Mark Erron H. San Mateo" },
  { value: "Mr. Marlou D. Natividad" },
  { value: "Mr. Nebzul B. Benoza" },
  { value: "Mr. Nelson L. Rivera" },
  { value: "Mr. Noel C. De Jesus" },
  { value: "Mr. Rex M. De Guzman" },
  { value: "Mr. Reymar A. Saracanlao" },
  { value: "Mr. Ron Joshua D. Mangalindan" },
  { value: "Mr. Ronaldo O. Sarmiento" },
  { value: "Mr. Therence L. Lalu" },
  { value: "Mr. Vincent Jeremy R. Cebu" },
  { value: "Mr. Yew Teck Tapnio" },
  { value: "Ms. Alexxis Missyah A. Lacson" },
  { value: "Ms. Alta Gracia V. De Dios" },
  { value: "Ms. Annie Rose N. Sto. Tomas" },
  { value: "Ms. Blessa Mae Mariano" },
  { value: "Ms. Cyrill S. Morgia" },
  { value: "Ms. Cyrylle Daphne Z. Ocampo" },
  { value: "Ms. Gemini A. Candelario" },
  { value: "Ms. Ian Rose B. Estrada" },
  { value: "Ms. Janice T. Depona" },
  { value: "Ms. Jenny Rose S. Sarmiento" },
  { value: "Ms. Jerehmia C. Navarro" },
  { value: "Ms. Julia Katreena Q. Perez" },
  { value: "Ms. Juvy G. Jurado" },
  { value: "Ms. Leizel D. Licay" },
  { value: "Ms. Lorielyn R. Costales" },
  { value: "Ms. Margarette Kaye D. Barcelona" },
  { value: "Ms. Maria Luisa D. Razo" },
  { value: "Ms. Mary Grace P. Agravante" },
  { value: "Ms. Mylene A. Lee" },
  { value: "Ms. Natalia A. Sapla" },
  { value: "Ms. Ofelia J. Timbol" },
  { value: "Ms. Phoebe Mae C. Nieto" },
  { value: "Ms. Ranmarielle G. Vinluan" },
  { value: "Ms. Rhea Lynne T. Bagtas" },
  { value: "Ms. Rica Pearl S. Alejo" },
  { value: "Ms. Rose Ann Joy G. Asto" },
  { value: "Ms. Sharize Nicole C. Paulino" },
  { value: "Ms. Valerie P. Cagas" },
  { value: "Ms. Vicky A. Lipayon" },
  { value: "Ms. Victoria Emery P. Ramos" },
];

const Inspectors = ({ value, disabled, onChange }) => {
  return (
    <ConfigProvider
    theme={{
      components: {
        AutoComplete: {
          optionFontSize: 10,
          colorTextPlaceholder: "#555",
          fontSize: "11px",
          boxShadow: "none",
        },
      },
    }}
  >
    <AutoComplete
      style={{
        width: "100%",
        fontSize: "11px",
      }}
      dropdownStyle={{
        boxShadow: "none",
        backgroundColor: "#f1f1f1",
      }}
      options={InspectorOptions}
      dropdownClassName="custom-autocomplete-dropdown"
      value={value}
      disabled={disabled}
      onChange={onChange}
      filterOption={(inputValue, option) =>
        option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
      }
      allowClear={true}
    >
      <Input
          style={{
            fontSize: "11px",
            height: "29px",
            padding: "4px 8px",
          }}
          placeholder="handler"
          placeholderStyle={{
            fontSize: "9px",
          }}
        />
    </AutoComplete>
  </ConfigProvider>
  );
};

export default Inspectors;
